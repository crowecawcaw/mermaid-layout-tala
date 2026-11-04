// Translated remaining placement stages from internal/trees/layout.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxPlaceTreesWorkUnits,
} from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Tree } from '../layoutgraph/records.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Orientation as O, GetOpposite } from '../geo/orientation.js';
import {
  NewTransaction,
  contextWithTransactionWorkGuard,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { fixedOrigin } from '../layoutgraph/containment.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import {
  NewGraphStateSnapshot,
  RollbackGraphState,
} from '../layoutgraph/graph-state.js';
import {
  offsetSubtree,
  directionPenalty,
  treePreprocessBadState as bad,
} from './geometry.js';
import { constructToOrientation, positionTreeEdgeLabels } from './layout.js';
import {
  treeDescendants,
  reconnectTreeGuarded,
  isIsolatedTreeGuarded,
  treeSize,
  rootsByTreeDirection,
  addTreeChild,
} from './preprocess-helpers.js';
import { TreeEdgeDirection } from './types.js';
export function treePlacementFixedOrigin(
  g: Graph,
  container: Node | null,
  guard: WorkGuard,
): Point | null {
  for (const node of g.Nodes) {
    guard.Step();
    if (node === null) throw bad('tree placement encountered a nil graph node');
    if (node.container() !== container) continue;
    const point = fixedOrigin(node);
    if (point !== null) return point;
  }
  return null;
}
export function placeAtOrientationGuarded(
  ctx: Context,
  g: Graph,
  placementTree: Tree,
  orientation: O,
  guard: WorkGuard,
): number {
  ctx = contextWithTransactionWorkGuard(ctx, guard);
  if (
    placementTree === null ||
    placementTree.Node === null ||
    placementTree.Node.TopLeft === null
  )
    throw bad('tree placement encountered an incomplete placement tree');
  guard.Finish();
  const positionOf = (n: Node): number => {
    switch (orientation) {
      case O.Left:
        return n.TopLeft!.X;
      case O.Right:
        return n.TopLeft!.X + n.Width;
      case O.Top:
        return n.TopLeft!.Y;
      default:
        return n.TopLeft!.Y + n.Height;
    }
  };
  const moveTree = (from: number, to: number): void => {
    let dx = 0,
      dy = 0;
    if (orientation === O.Left || orientation === O.Right)
      dx = Round(to - from);
    else if (orientation === O.Top || orientation === O.Bottom)
      dy = Round(to - from);
    for (const child of placementTree.Children) {
      guard.Step();
      offsetSubtree(child, dx, dy, guard);
    }
    guard.Finish();
  };
  const further = (a: number, b: number): boolean =>
    orientation === O.Left || orientation === O.Top ? a < b : a > b;
  const rootPosition = positionOf(placementTree.Node);
  let borderPosition = rootPosition;
  const descendants = treeDescendants(placementTree, guard),
    isNodeOfTree = new Set<Node>([placementTree.Node]);
  for (const descendant of descendants) {
    guard.Step();
    isNodeOfTree.add(descendant.Node);
  }
  for (const n of g.Nodes) {
    guard.Step();
    if (n === null || n.TopLeft === null)
      throw bad('tree placement encountered an incomplete graph node');
    if (!isNodeOfTree.has(n)) {
      const position = positionOf(n);
      if (further(position, borderPosition)) borderPosition = position;
    }
  }
  let currentBestPosition = borderPosition,
    currentBestDistance = Math.abs(currentBestPosition - rootPosition);
  moveTree(0, borderPosition);
  const origin = treePlacementFixedOrigin(
    g,
    placementTree.Node.container(),
    guard,
  );
  if (origin !== null) {
    let hasNegative = false;
    for (const tree of [placementTree, ...descendants]) {
      guard.Step();
      if (tree.Node.TopLeft!.X < origin.X || tree.Node.TopLeft!.Y < origin.Y) {
        hasNegative = true;
        break;
      }
    }
    if (hasNegative) currentBestDistance = Infinity;
  }
  const obstacles: number[] = [];
  for (const n of g.Nodes) {
    guard.Step();
    if (!isNodeOfTree.has(n)) {
      const position = positionOf(n);
      if (further(borderPosition, position) && further(position, rootPosition))
        obstacles.push(position);
    }
  }
  obstacles.push(rootPosition);
  const txn = NewTransaction(ctx, g, {
    AffectContainers: false,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  for (const obstacle of obstacles) {
    guard.Step();
    txn.AddOp(() => moveTree(currentBestPosition, obstacle));
    try {
      txn.Commit(ctx);
    } catch (error) {
      txn.Clear();
      if (IsCandidateRejection(error)) continue;
      throw error;
    }
    try {
      guard.Finish();
    } catch (error) {
      txn.Clear();
      throw error;
    }
    const distance = Math.abs(obstacle - rootPosition);
    if (distance < currentBestDistance) {
      currentBestPosition = obstacle;
      currentBestDistance = distance;
      try {
        txn.UpdateState();
      } catch (error) {
        txn.Clear();
        throw error;
      }
    } else txn.Rollback();
    txn.Clear();
  }
  guard.Finish();
  return currentBestDistance;
}
export function normalizedAspectRatio(g: Graph, guard: WorkGuard): number {
  for (const node of g.Nodes) {
    guard.Step();
    if (node === null || node.TopLeft === null)
      throw bad('tree placement encountered an incomplete graph node');
    for (const _ of g.Nodes) guard.Step();
  }
  for (const edge of g.Edges) {
    guard.Step();
    if (edge === null) throw bad('tree placement encountered a nil graph edge');
    for (const point of edge.Points) {
      guard.Step();
      if (point === null)
        throw bad('tree placement encountered a nil route point');
    }
  }
  const [tl, br] = BoundingBox(g);
  if (tl === null || br === null)
    throw bad('tree placement could not compute a graph bounding box');
  guard.Finish();
  const width = br.X - tl.X,
    height = br.Y - tl.Y;
  return width >= height ? width / height : height / width;
}
export function placeTree(
  ctx: Context,
  g: Graph,
  placementTree: Tree,
  container: Node | null,
  existingPlacements: Map<O, boolean>,
  guard: WorkGuard,
): O {
  const descendants = treeDescendants(placementTree, guard);
  for (const t of descendants) {
    guard.Step();
    t.Node.TopLeft = new Point(0, 0);
    guard.Finish();
  }
  reconnectTreeGuarded(g, placementTree, container, guard);
  let bestOrientation = O.TopLeft,
    bestDistance = Infinity,
    bestRatio = Infinity;
  const defaultOrder = [O.Bottom, O.Top, O.Left, O.Right];
  let order: O[] = [];
  const isolated = isIsolatedTreeGuarded(g, placementTree.Node, guard);
  if (existingPlacements.size === 1) {
    for (const o of defaultOrder)
      if (existingPlacements.has(o)) {
        bestOrientation = GetOpposite(o);
        break;
      }
  } else {
    if (isolated) {
      for (const o of defaultOrder)
        if (!existingPlacements.has(o)) order.push(o);
      if (order.length === 0) order = defaultOrder;
    } else order = defaultOrder;
    const direction = g.Direction(container);
    for (const orientation of order) {
      guard.Step();
      constructToOrientation(placementTree, orientation, guard);
      let distance = placeAtOrientationGuarded(
        ctx,
        g,
        placementTree,
        orientation,
        guard,
      );
      const ratio = normalizedAspectRatio(g, guard);
      if (orientation !== direction) distance += directionPenalty;
      if (distance < bestDistance) {
        bestOrientation = orientation;
        bestDistance = distance;
        bestRatio = ratio;
      } else if (distance === bestDistance && ratio < bestRatio) {
        bestOrientation = orientation;
        bestRatio = ratio;
      }
    }
  }
  guard.Step();
  constructToOrientation(placementTree, bestOrientation, guard);
  placeAtOrientationGuarded(ctx, g, placementTree, bestOrientation, guard);
  positionTreeEdgeLabels(placementTree, isolated, guard);
  return bestOrientation;
}
export function buildPlacementTrees(g: Graph, guard: WorkGuard): Tree[] {
  const placements: Tree[] = [];
  for (const sentinel of g.Nodes) {
    guard.Step();
    const firstPlacementTree = placements.length,
      roots = g.Trees.get(sentinel);
    if (roots === undefined) continue;
    const isolated = isIsolatedTreeGuarded(g, sentinel, guard);
    if (isolated) {
      const byDirection = rootsByTreeDirection(roots, guard),
        undirected = byDirection.get(TreeEdgeDirection.Undirected) ?? [];
      byDirection.delete(TreeEdgeDirection.Undirected);
      for (const matchingRoots of byDirection.values()) {
        const arrowheadSentinels = new Map<string, Tree>();
        for (const root of matchingRoots) {
          guard.Step();
          if (root === null || root.SentinelEdge === null)
            throw bad('tree placement encountered an incomplete root');
          const arrowhead = root.SentinelEdge.ArrowheadTo(sentinel);
          if (!arrowheadSentinels.has(arrowhead)) {
            const tree = new Tree(sentinel);
            arrowheadSentinels.set(arrowhead, tree);
            placements.push(tree);
          }
          addTreeChild(arrowheadSentinels.get(arrowhead)!, root, guard);
        }
      }
      if (undirected.length > 0) {
        let mergeWith: Tree | null = null;
        for (const tree of placements.slice(firstPlacementTree)) {
          guard.Step();
          if (
            mergeWith !== null &&
            tree.Children.length <= mergeWith.Children.length
          )
            continue;
          if (
            tree.Children.length > 0 &&
            !tree.Children[0]!.SentinelEdge!.HasArrowTo(sentinel)
          )
            mergeWith = tree;
        }
        if (mergeWith === null) {
          mergeWith = new Tree(sentinel);
          placements.push(mergeWith);
        }
        for (const root of undirected) addTreeChild(mergeWith, root, guard);
      }
    } else
      for (const root of roots) {
        guard.Step();
        const tree = new Tree(sentinel);
        addTreeChild(tree, root, guard);
        placements.push(tree);
      }
  }
  guard.Check();
  return placements;
}
export function placeTrees(
  ctx: Context,
  g: Graph,
  container: Node | null,
  guard: WorkGuard,
): void {
  const placements = buildPlacementTrees(g, guard),
    sizes = new Map<Tree, number>();
  for (const tree of placements) sizes.set(tree, treeSize(tree, guard));
  for (let width = 1; width < placements.length;) {
    for (const _ of placements) guard.Step();
    if (width > Math.trunc(placements.length / 2)) break;
    width *= 2;
  }
  placements.sort((a, b) => {
    const size = sizes.get(b)! - sizes.get(a)!;
    if (size !== 0) return size;
    const aID = a.Children[0]!.Node.ID,
      bID = b.Children[0]!.Node.ID;
    return aID < bID ? -1 : aID > bID ? 1 : 0;
  });
  const sides = new Map<Node, Map<O, boolean>>();
  for (const tree of placements) {
    guard.Step();
    if (!sides.has(tree.Node)) sides.set(tree.Node, new Map());
    const orientation = placeTree(
      ctx,
      g,
      tree,
      container,
      sides.get(tree.Node)!,
      guard,
    );
    sides.get(tree.Node)!.set(orientation, true);
    guard.Finish();
  }
  for (const sentinel of g.Nodes) {
    guard.Step();
    for (const root of g.Trees.get(sentinel) ?? []) {
      guard.Step();
      root.Parent = null;
      guard.Finish();
    }
  }
  guard.Check();
}
export function placeTreesWithWorkLimit(
  ctx: Context,
  g: Graph,
  container: Node | null,
  workLimit: bigint,
): void {
  validateEngineGraph(ctx, 'PlaceTrees', g);
  const guard = new WorkGuard(ctx, 'PlaceTrees', MaxEngineWorkUnits);
  guard.SetLimit(workLimit);
  const state = NewGraphStateSnapshot({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  if (container !== null && !state.nodes.has(container))
    throw bad('cannot place trees into an unknown container');
  let complete = false;
  try {
    placeTrees(ctx, g, container, guard);
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
export function Place(ctx: Context, g: Graph, container: Node | null): void {
  placeTreesWithWorkLimit(ctx, g, container, MaxPlaceTreesWorkUnits);
}
