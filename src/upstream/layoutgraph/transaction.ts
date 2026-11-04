// Translated from internal/layoutgraph/transaction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxTransactionWorkUnits,
  MaxEngineNodes,
  MaxTransactionOverlapReferences,
} from '../limits/work.js';
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import { Point } from '../geo/point.js';
import { GraphState, RollbackGraphState } from './graph-state.js';
import { ErrInvalidCandidate } from './errors.js';
import { New as invariant } from '../invariant/errors.js';
import {
  buildTransactionOverlaps,
  transactionNodeHasFiniteBox,
} from './transaction-overlaps.js';
import { DoesOverlapExact } from './node-spatial.js';
import { wrapChildren } from './node-geometry.js';
import { deltaToGuarded } from './node-spacing.js';
import { SyncClusters, SyncSequences } from './group-geometry.js';
import { ancestorsOfGuarded } from './containment.js';
import {
  isBadStateContext,
  isStructurallyBadStateWithFixedOriginContext,
} from './bad-state.js';
import {
  SnapshotPlacementCosts,
  EdgeLengthCacheEntries,
  type PlacementCostSnapshot,
} from './placement-cost.js';
import { maxEngineTopologyReferences } from './topology-preflight.js';
export interface TransactionOptions {
  AffectContainers: boolean;
  IgnoreContainerEscape: boolean;
  AffectEdgeRoutes: boolean;
}
const workGuardKey = Symbol('transactionWorkGuard');
export function contextWithTransactionWorkGuard(
  ctx: Context,
  guard: WorkGuard,
): Context {
  if (ctx == null || guard == null) return ctx;
  return {
    Done: () => ctx.Done(),
    Err: () => ctx.Err(),
    Value: (key) => (key === workGuardKey ? guard : ctx.Value?.(key)),
  };
}
export function ExistingTransactionWorkGuard(
  ctx: Context,
  location: string,
): [WorkGuard | null, boolean] {
  if (ctx == null) throw new Error(`TALA ${location} requires a context`);
  const guard = ctx.Value?.(workGuardKey);
  if (guard instanceof WorkGuard) {
    guard.Finish();
    return [guard, true];
  }
  return [null, false];
}
export function EnsureTransactionWorkGuard(
  ctx: Context,
  location: string,
): [Context, WorkGuard] {
  const [existing, exists] = ExistingTransactionWorkGuard(ctx, location);
  if (exists) return [ctx, existing!];
  const guard = new WorkGuard(ctx, location, MaxTransactionWorkUnits);
  return [contextWithTransactionWorkGuard(ctx, guard), guard];
}
export function NewTransaction(
  ctx: Context,
  g: Graph,
  options: TransactionOptions,
  guard: WorkGuard | null = null,
): Transaction {
  if (guard === null)
    [, guard] = EnsureTransactionWorkGuard(ctx, 'Transaction');
  else if (ctx == null) throw new Error('TALA transaction requires a context');
  guard.Finish();
  const state = new GraphState({
    CaptureTopology: false,
    CaptureEdgeRoutes: options.AffectEdgeRoutes,
  });
  state.UpdateWithWorkGuard(g, guard);
  [state.existingOverlaps, state.existingExactOverlaps] =
    buildTransactionOverlaps(g, guard);
  const txn = new Transaction(g, state, options, guard);
  guard.Finish();
  return txn;
}
export function hasOriginalNodeOrder(
  state: GraphState | null,
  g: Graph | null,
): boolean {
  if (
    state === null ||
    g === null ||
    state.originalNodes.length !== g.Nodes.length
  )
    return false;
  for (let i = 0; i < g.Nodes.length; i++)
    if (state.originalNodes[i] !== g.Nodes[i]) return false;
  return true;
}
export function geometryChanged(
  state: GraphState | null,
  node: Node | null,
): boolean {
  if (state === null || node === null) return true;
  const original = state.nodeGeometry.get(node);
  if (!original) return true;
  if (node.TopLeft === null)
    return (
      original.topLeft.pointer !== null ||
      node.Width !== original.width ||
      node.Height !== original.height
    );
  return (
    original.topLeft.pointer === null ||
    node.TopLeft.X !== original.topLeft.value!.X ||
    node.TopLeft.Y !== original.topLeft.value!.Y ||
    node.Width !== original.width ||
    node.Height !== original.height
  );
}
export function transactionBoxesMayInteract(
  first: Node | null,
  second: Node | null,
): boolean {
  if (
    first === null ||
    second === null ||
    first === second ||
    first.TopLeft === null ||
    second.TopLeft === null
  )
    return false;
  return !(
    first.TopLeft.X > second.TopLeft.X + second.Width + 500 ||
    first.TopLeft.X + first.Width + 500 < second.TopLeft.X ||
    first.TopLeft.Y > second.TopLeft.Y + second.Height + 500 ||
    first.TopLeft.Y + first.Height + 500 < second.TopLeft.Y
  );
}
interface SweepNode {
  node: Node;
  index: number;
}
function compareSweep(left: SweepNode, right: SweepNode): number {
  if (left.node.TopLeft!.X !== right.node.TopLeft!.X) {
    if (left.node.TopLeft!.X < right.node.TopLeft!.X) return -1;
    if (right.node.TopLeft!.X < left.node.TopLeft!.X) return 1;
    return 0;
  }
  if (left.node.ID !== right.node.ID)
    return left.node.ID < right.node.ID ? -1 : 1;
  return left.index < right.index ? -1 : left.index > right.index ? 1 : 0;
}
function checkContext(ctx: Context): void {
  const error = ctx.Err();
  if (error !== null) throw error;
}
export class Transaction {
  Ops: (() => void)[] = [];
  spareGraphState: GraphState | null = null;
  placementCostSnapshot: PlacementCostSnapshot | null = null;
  dirtyNodes = new Set<Node>();
  dirtyNodeMarks: boolean[] = [];
  fixedOrigins = new Map<Node | null, Point>();
  overlapCandidates: number[][] = [];
  overlapSweepNodes: SweepNode[] = [];
  overlapActiveNodes: SweepNode[] = [];
  overlapNodeIndices = new Map<Node, number[]>();
  overlapNodeIndexReady = false;
  priorGraphStateShared = false;
  overlapInvalidBoxes: boolean[] = [];
  exceptionMarks: number[] = [];
  exceptionGeneration = 0;
  descendantStack: { node: Node; emit: boolean }[] = [];
  descendantNodes: Node[] = [];
  descendantSeen = new Map<Node, number>();
  descendantGeneration = 0;
  constructor(
    public Graph: Graph,
    public PriorGraphState: GraphState,
    public options: TransactionOptions,
    public guard: WorkGuard,
  ) {}
  PreservePriorGraphState(): GraphState {
    this.priorGraphStateShared = true;
    return this.PriorGraphState;
  }
  CapturePlacementCosts(location: string): void {
    if (this.Graph == null || this.guard == null)
      throw new Error(
        `TALA ${location} placement-cost snapshot requires an initialized transaction`,
      );
    if (this.placementCostSnapshot !== null) return;
    const entries = EdgeLengthCacheEntries(this.Graph);
    if (entries > maxEngineTopologyReferences)
      throw new Error(
        `TALA ${location} edge-length cache entries exceed limit ${maxEngineTopologyReferences}`,
      );
    for (let i = 0; i < entries; i++) this.guard.Step();
    const costs = SnapshotPlacementCosts(this.Graph);
    this.guard.Finish();
    this.placementCostSnapshot = costs;
  }
  RestorePlacementCosts(): boolean {
    if (this.placementCostSnapshot === null) return false;
    const costs = this.placementCostSnapshot;
    this.placementCostSnapshot = null;
    costs.Restore();
    return true;
  }
  UpdateState(): void {
    const previous = this.PriorGraphState,
      updated =
        this.spareGraphState ??
        new GraphState({ CaptureTopology: false, CaptureEdgeRoutes: false });
    updated.captureTopology = previous.captureTopology;
    updated.captureEdgeRoutes = previous.captureEdgeRoutes;
    try {
      updated.UpdateWithWorkGuard(this.Graph, this.guard);
    } catch (e) {
      this.Rollback();
      throw e;
    }
    updated.existingOverlaps = previous.existingOverlaps;
    updated.existingExactOverlaps = previous.existingExactOverlaps;
    this.PriorGraphState = updated;
    if (this.priorGraphStateShared) {
      this.spareGraphState = null;
      this.priorGraphStateShared = false;
    } else this.spareGraphState = previous;
  }
  AddOp(fn: () => void): void {
    this.Ops.push(fn);
  }
  repositionContainers(ctx: Context): void {
    const order: Node[] = [];
    for (const container of this.Graph.Containers.keys()) {
      this.guard.Step();
      if (container === null || container.TopLeft === null) continue;
      order.push(container);
    }
    order.sort((a, b) =>
      a.Width * a.Height === b.Width * b.Height
        ? a.ID < b.ID
          ? -1
          : a.ID > b.ID
            ? 1
            : 0
        : a.Width * a.Height < b.Width * b.Height
          ? -1
          : 1,
    );
    for (const container of order) {
      checkContext(ctx);
      wrapChildren(container);
      this.guard.Step();
    }
    this.guard.Finish();
  }
  collectFixedOrigins(ctx: Context): void {
    this.fixedOrigins.clear();
    if (!this.PriorGraphState.hasFixedTopLeft) {
      this.guard.Finish();
      return;
    }
    for (const node of this.Graph.Nodes) {
      this.guard.Step();
      checkContext(ctx);
      if (node === null || node.TopLeft === null || node.FixedTopLeft === null)
        continue;
      const container = node.container();
      if (this.fixedOrigins.has(container)) continue;
      this.fixedOrigins.set(
        container,
        new Point(
          node.TopLeft.X - node.FixedTopLeft.X,
          node.TopLeft.Y - node.FixedTopLeft.Y,
        ),
      );
    }
    this.guard.Finish();
  }
  collectOverlapValidationNodes(ctx: Context): boolean {
    if (!hasOriginalNodeOrder(this.PriorGraphState, this.Graph)) return false;
    this.dirtyNodes.clear();
    this.dirtyNodeMarks = new Array(this.Graph.Nodes.length).fill(false);
    for (let index = 0; index < this.Graph.Nodes.length; index++) {
      const node = this.Graph.Nodes[index]!;
      this.guard.Step();
      checkContext(ctx);
      if (geometryChanged(this.PriorGraphState, node)) {
        this.dirtyNodes.add(node);
        this.dirtyNodeMarks[index] = true;
      }
    }
    this.guard.Finish();
    return true;
  }
  buildPostStateOverlapCandidates(ctx: Context, dirtyOnly: boolean): void {
    const nodeCount = this.Graph.Nodes.length;
    if (nodeCount > MaxEngineNodes)
      throw new Error(
        `TALA transaction node count exceeds limit ${MaxEngineNodes}`,
      );
    this.overlapCandidates.length = nodeCount;
    for (let i = 0; i < nodeCount; i++) {
      if (this.overlapCandidates[i]) this.overlapCandidates[i]!.length = 0;
      else this.overlapCandidates[i] = [];
    }
    this.overlapInvalidBoxes = new Array(nodeCount).fill(false);
    while (this.exceptionMarks.length < nodeCount) this.exceptionMarks.push(0);
    this.exceptionMarks.length = nodeCount;
    const rebuildNodeIndex = !dirtyOnly || !this.overlapNodeIndexReady;
    if (rebuildNodeIndex)
      for (const indices of this.overlapNodeIndices.values())
        indices.length = 0;
    this.overlapSweepNodes.length = 0;
    let hasInvalidBox = false,
      dirtyCount = 0;
    for (let index = 0; index < this.Graph.Nodes.length; index++) {
      const node = this.Graph.Nodes[index]!;
      this.guard.Step();
      checkContext(ctx);
      if (node === null)
        throw invariant(
          'transaction overlap check encountered a nil graph node',
        );
      if (rebuildNodeIndex) {
        const indices = this.overlapNodeIndices.get(node) ?? [];
        indices.push(index);
        this.overlapNodeIndices.set(node, indices);
      }
      if (dirtyOnly && this.dirtyNodeMarks[index]) dirtyCount++;
      if (node.TopLeft === null) continue;
      if (!transactionNodeHasFiniteBox(node)) {
        this.overlapInvalidBoxes[index] = true;
        hasInvalidBox = true;
        continue;
      }
      this.overlapSweepNodes.push({ node, index });
    }
    this.overlapNodeIndexReady = dirtyOnly;
    let retainedReferences = 0n;
    const addPair = (first: number, second: number): void => {
      if (retainedReferences > MaxTransactionOverlapReferences - 2n)
        throw new Error(
          `TALA transaction overlap references exceed limit ${MaxTransactionOverlapReferences}`,
        );
      this.overlapCandidates[first]!.push(second);
      this.overlapCandidates[second]!.push(first);
      retainedReferences += 2n;
    };
    const useDirtyScan = dirtyOnly && dirtyCount * 4 < nodeCount;
    if (useDirtyScan) {
      for (let first = 0; first < this.Graph.Nodes.length; first++) {
        const firstNode = this.Graph.Nodes[first]!;
        if (!this.dirtyNodeMarks[first] || firstNode.TopLeft === null) continue;
        for (let second = 0; second < this.Graph.Nodes.length; second++) {
          const secondNode = this.Graph.Nodes[second]!;
          this.guard.Step();
          if (
            second === first ||
            firstNode === secondNode ||
            secondNode.TopLeft === null
          )
            continue;
          if (this.dirtyNodeMarks[second] && second < first) continue;
          if (!transactionBoxesMayInteract(firstNode, secondNode)) continue;
          addPair(first, second);
        }
      }
    } else {
      this.overlapSweepNodes.sort(compareSweep);
      this.overlapActiveNodes.length = 0;
      for (const current of this.overlapSweepNodes) {
        this.guard.Step();
        const kept: SweepNode[] = [];
        for (const other of this.overlapActiveNodes) {
          this.guard.Step();
          if (
            other.node.TopLeft!.X + other.node.Width + 500 <
            current.node.TopLeft!.X
          )
            continue;
          kept.push(other);
          if (
            other.node === current.node ||
            !transactionBoxesMayInteract(other.node, current.node)
          )
            continue;
          if (
            dirtyOnly &&
            !this.dirtyNodeMarks[other.index] &&
            !this.dirtyNodeMarks[current.index]
          )
            continue;
          addPair(other.index, current.index);
        }
        kept.push(current);
        this.overlapActiveNodes = kept;
      }
      if (hasInvalidBox)
        for (let first = 0; first < nodeCount; first++)
          for (let second = first + 1; second < nodeCount; second++) {
            if (
              !this.overlapInvalidBoxes[first] &&
              !this.overlapInvalidBoxes[second]
            )
              continue;
            if (
              dirtyOnly &&
              !this.dirtyNodeMarks[first] &&
              !this.dirtyNodeMarks[second]
            )
              continue;
            this.guard.Step();
            const firstNode = this.Graph.Nodes[first]!,
              secondNode = this.Graph.Nodes[second]!;
            if (
              firstNode === secondNode ||
              firstNode.TopLeft === null ||
              secondNode.TopLeft === null ||
              !transactionBoxesMayInteract(firstNode, secondNode)
            )
              continue;
            addPair(first, second);
          }
    }
    for (const candidates of this.overlapCandidates) {
      this.guard.Step();
      candidates.sort((a, b) => a - b);
    }
    this.guard.Finish();
  }
  markOverlapException(node: Node, generation: number): void {
    for (const index of this.overlapNodeIndices.get(node) ?? [])
      this.exceptionMarks[index] = generation;
  }
  markDescendantOverlapExceptions(
    node: Node | null,
    includeClusterNodes: boolean,
    generation: number,
  ): void {
    this.descendantGeneration = (this.descendantGeneration + 1) >>> 0;
    if (this.descendantGeneration === 0) {
      this.descendantSeen.clear();
      this.descendantGeneration = 1;
    }
    const seenGeneration = this.descendantGeneration;
    this.descendantStack.length = 0;
    this.descendantNodes.length = 0;
    if (node !== null) this.descendantSeen.set(node, seenGeneration);
    const pushChildren = (parent: Node | null): void => {
      const sequence = this.Graph.Sequences.get(parent!);
      if (sequence)
        for (let i = sequence.Nodes.length - 1; i >= 0; i--) {
          this.guard.Step();
          this.descendantStack.push({
            node: sequence.Nodes[i]!,
            emit: includeClusterNodes,
          });
        }
      if (parent !== null && parent.isClusterVessel) {
        const cluster = this.Graph.Clusters.get(parent);
        if (cluster)
          for (let i = cluster.Nodes.length - 1; i >= 0; i--) {
            this.guard.Step();
            this.descendantStack.push({
              node: cluster.Nodes[i]!,
              emit: includeClusterNodes,
            });
          }
      }
      if (parent === null || parent.isContainer) {
        const children = this.Graph.Containers.get(parent) ?? [];
        for (let i = children.length - 1; i >= 0; i--) {
          this.guard.Step();
          this.descendantStack.push({ node: children[i]!, emit: true });
        }
      }
    };
    pushChildren(node);
    while (this.descendantStack.length > 0) {
      this.guard.Step();
      const current = this.descendantStack.pop()!;
      if (
        current.node === null ||
        this.descendantSeen.get(current.node) === seenGeneration
      )
        continue;
      this.descendantSeen.set(current.node, seenGeneration);
      if (current.emit) this.descendantNodes.push(current.node);
      pushChildren(current.node);
    }
    for (const descendant of this.descendantNodes) {
      this.guard.Step();
      this.markOverlapException(descendant, generation);
    }
    this.guard.Finish();
  }
  hasBadPostStateOverlap(nodeIndex: number): boolean {
    const node = this.Graph.Nodes[nodeIndex]!;
    if (node === null || node.TopLeft === null) return node === null;
    if (node.Cluster !== null) return false;
    this.exceptionGeneration = (this.exceptionGeneration + 1) >>> 0;
    if (this.exceptionGeneration === 0) {
      this.exceptionMarks.fill(0);
      this.exceptionGeneration = 1;
    }
    const generation = this.exceptionGeneration;
    if (
      node.isContainer ||
      node.isClusterVessel ||
      this.Graph.Sequences.get(node) != null
    )
      this.markDescendantOverlapExceptions(node, true, generation);
    if (
      node.Container !== null ||
      node.Cluster !== null ||
      node.Sequence !== null
    )
      for (const ancestor of ancestorsOfGuarded(node, this.guard)) {
        this.guard.Step();
        this.markOverlapException(ancestor, generation);
      }
    const pairwiseExceptions = this.PriorGraphState.existingOverlaps.get(node),
      right = node.TopLeft.X + node.Width,
      bottom = node.TopLeft.Y + node.Height;
    for (const otherIndex of this.overlapCandidates[nodeIndex]!) {
      this.guard.Step();
      const other = this.Graph.Nodes[otherIndex]!;
      if (other === null)
        throw invariant(
          'transaction overlap check encountered a nil graph node',
        );
      if (
        pairwiseExceptions?.has(other) ||
        this.exceptionMarks[otherIndex] === generation
      )
        continue;
      if (other.TopLeft === null || !transactionBoxesMayInteract(node, other))
        continue;
      const delta = deltaToGuarded(node, other, node.TopLeft, this.guard);
      if (
        node.TopLeft.X < other.TopLeft.X + other.Width + delta &&
        right + delta > other.TopLeft.X &&
        node.TopLeft.Y < other.TopLeft.Y + other.Height + delta &&
        bottom + delta > other.TopLeft.Y
      )
        return true;
    }
    this.guard.Finish();
    return false;
  }
  Commit(ctx: Context): void {
    try {
      if (ctx == null)
        throw new Error('TALA transaction commit requires a context');
      if (this.guard == null)
        throw new Error('TALA transaction commit requires a work guard');
      this.guard.Finish();
      checkContext(ctx);
      for (const op of this.Ops.slice()) {
        this.guard.Step();
        checkContext(ctx);
        op();
        checkContext(ctx);
        if (this.options.AffectContainers) {
          this.repositionContainers(ctx);
          for (const container of this.Graph.Containers.keys()) {
            this.guard.Step();
            checkContext(ctx);
            if (container === null || container.TopLeft === null) continue;
            if (
              isBadStateContext(
                this.Graph,
                container,
                this.PriorGraphState,
                this.options.IgnoreContainerEscape,
                this.guard,
              )
            )
              throw ErrInvalidCandidate;
          }
        }
        SyncClusters(this.Graph);
        SyncSequences(this.Graph);
        checkContext(ctx);
      }
      const dirty = this.collectOverlapValidationNodes(ctx);
      this.collectFixedOrigins(ctx);
      for (const n of this.Graph.Nodes) {
        this.guard.Step();
        checkContext(ctx);
        if (n === null)
          throw invariant('transaction bad-state check received a nil node');
        if (n.TopLeft === null) continue;
        const fixedOrigin = this.fixedOrigins.get(n.container()) ?? null;
        const [bad] = isStructurallyBadStateWithFixedOriginContext(
          this.Graph,
          n,
          this.PriorGraphState,
          this.options.IgnoreContainerEscape,
          fixedOrigin,
          true,
          this.guard,
        );
        if (bad) throw ErrInvalidCandidate;
      }
      this.buildPostStateOverlapCandidates(ctx, dirty);
      for (let i = 0; i < this.Graph.Nodes.length; i++) {
        const n = this.Graph.Nodes[i]!;
        if (this.overlapCandidates[i]!.length === 0) continue;
        this.guard.Step();
        checkContext(ctx);
        if (n.TopLeft === null) continue;
        if (this.hasBadPostStateOverlap(i)) throw ErrInvalidCandidate;
      }
      for (const [n1, overlaps] of this.PriorGraphState.existingOverlaps) {
        this.guard.Step();
        checkContext(ctx);
        for (const n2 of overlaps) {
          if (dirty && !this.dirtyNodes.has(n1) && !this.dirtyNodes.has(n2))
            continue;
          this.guard.Step();
          checkContext(ctx);
          const wasExact =
            this.PriorGraphState.existingExactOverlaps.get(n1)?.has(n2) ??
            false;
          if (!wasExact && DoesOverlapExact(n1, n2)) throw ErrInvalidCandidate;
        }
      }
      checkContext(ctx);
      this.guard.Finish();
    } catch (error) {
      this.Rollback();
      throw error;
    }
  }
  Clear(): void {
    this.Ops = [];
  }
  Rollback(): void {
    RollbackGraphState(this.Graph, this.PriorGraphState);
  }
  CloneGeometryContext(): Transaction {
    if (this.PriorGraphState == null || this.guard == null)
      throw new Error(
        'TALA geometry transaction clone requires an initialized transaction',
      );
    if (this.PriorGraphState.captureTopology)
      throw new Error(
        'TALA topology transaction requires an independent clone',
      );
    this.guard.Finish();
    this.priorGraphStateShared = true;
    const clone = new Transaction(
      this.Graph,
      this.PriorGraphState,
      this.options,
      this.guard,
    );
    clone.Ops = this.Ops.slice();
    clone.priorGraphStateShared = true;
    return clone;
  }
}
