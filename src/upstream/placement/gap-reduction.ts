// Translated from internal/placement/gapreduction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import {
  connectedNodes,
  ConnectedNodeSet,
} from '../layoutgraph/connected-set.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { nearestSharedAncestor } from '../layoutgraph/placement-ancestry.js';
import { IsBlocked } from '../layoutgraph/node-spatial.js';
import { SyncClusters, SyncSequences } from '../layoutgraph/group-geometry.js';
import { InnerBox, containerPadding } from '../layoutgraph/node-geometry.js';
import {
  moveNodeWithChildren,
  allDescendantNodesGuarded,
  unboundedWork,
} from '../layoutgraph/containment.js';
import { RollbackGraphState } from '../layoutgraph/graph-state.js';
import {
  Transaction,
  NewTransaction,
  EnsureTransactionWorkGuard,
} from '../layoutgraph/transaction.js';
import {
  ErrInvalidCandidate,
  ErrNonImprovingCandidate,
  IsCandidateRejection,
} from '../layoutgraph/errors.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { IdealGapSize } from '../placementcost/geometry.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import {
  LayoutAxis,
  TraversalDirection,
  axisValid,
  directionValid,
  oppositeDirection,
} from './axis.js';
import { nearestBetween, nearestConnectedAhead } from './gap-geometry.js';
import { largeGapThreshold } from './tuning.js';
export interface GapReductionOptions {
  axis: LayoutAxis;
  direction: TraversalDirection;
  attemptRecoverSymmetry?: boolean;
  costTxn?: Transaction | null;
}
const costOptions = {
  EdgeAbductions: null,
  IncludeNodeSizes: true,
  EnforceMinimumGap: false,
  PenalizeDirection: false,
};
export function reduceGapToNeighbors(
  ctx: Context,
  initial: Node,
  initialTxn: Transaction | null,
  options: GapReductionOptions,
): [boolean, number] {
  const error = ctx.Err();
  if (error) throw error;
  if (!axisValid(options.axis))
    throw new Error('TALA gap reduction requires an axis');
  if (!directionValid(options.direction))
    throw new Error('TALA gap reduction requires a direction');
  const horizontal = options.axis === LayoutAxis.Horizontal,
    forwards = options.direction === TraversalDirection.Forward;
  let node = initial,
    txn = initialTxn;
  const graph = node.Graph!;
  if (graph.CellSize === 0) graph.ComputeCellSize();
  let ahead = nearestConnectedAhead(node, horizontal, forwards);
  if (!ahead) return [false, 0];
  for (let c = ahead.Container; c; c = c.Container)
    if (c.FixedTopLeft) return [false, 0];
  const excluded: Node[] = [node];
  if (node.HerdAssignment)
    for (const sibling of graph.Containers.get(node.Container) ?? []) {
      if (
        sibling === node ||
        !sibling.HerdAssignment ||
        isDescendantOf(ahead, sibling)
      )
        continue;
      if (
        sibling.HerdAssignment.Orientation === node.HerdAssignment.Orientation
      )
        excluded.push(sibling);
    }
  const shared = nearestSharedAncestor(node, ahead);
  const between = nearestBetween(
    connectedNodes(ahead, excluded, graph),
    node,
    ahead,
    shared,
    horizontal,
    forwards,
  );
  excluded.push(...graph.Nodes.filter((n) => n.FixedTopLeft !== null));
  const connected = ConnectedNodeSet(ahead, excluded, graph);
  if (between) ahead = between;
  options.costTxn?.CapturePlacementCosts('GapNormalizationTransactions');
  const oldLength = EdgeLength(ctx, graph, costOptions);
  let newLength = oldLength;
  const betweenNodes: Node[] = [];
  for (const n of graph.Nodes) {
    if (n === node || n === ahead || connected.includes(n)) continue;
    if (
      forwards
        ? IsBlocked(n, node, ahead, true, horizontal)
        : IsBlocked(n, ahead, node, true, horizontal)
    )
      betweenNodes.push(n);
  }
  let backwardTxn: Transaction | null = null;
  for (const candidate of [node, ...betweenNodes]) {
    let candidateNode: Node | null = candidate;
    while (candidateNode.container() !== ahead.container()) {
      candidateNode = candidateNode.container();
      if (!candidateNode) break;
    }
    if (!candidateNode) continue;
    let gap: number;
    if (horizontal)
      gap = forwards
        ? ahead.TopLeft!.X - (candidateNode.TopLeft!.X + candidateNode.Width)
        : candidateNode.TopLeft!.X - (ahead.TopLeft!.X + ahead.Width);
    else
      gap = forwards
        ? ahead.TopLeft!.Y - (candidateNode.TopLeft!.Y + candidateNode.Height)
        : candidateNode.TopLeft!.Y - (ahead.TopLeft!.Y + ahead.Height);
    if (gap <= largeGapThreshold * graph.CellSize) continue;
    let delta = IdealGapSize - gap;
    if (!forwards) delta = -delta;
    if (delta === 0) continue;
    let candidateLength = 0;
    if (!txn)
      txn = NewTransaction(ctx, graph, {
        AffectContainers: true,
        IgnoreContainerEscape: false,
        AffectEdgeRoutes: false,
      });
    else {
      txn.Clear();
      txn.UpdateState();
    }
    const activeTxn = txn;
    txn.AddOp(() => {
      for (const n of connected)
        n.Translate(horizontal ? delta : 0, horizontal ? 0 : delta);
      SyncClusters(graph);
      SyncSequences(graph);
      candidateLength = EdgeLength(ctx, graph, costOptions);
      if (options.attemptRecoverSymmetry) {
        if (!backwardTxn) backwardTxn = activeTxn.CloneGeometryContext();
        backwardTxn.Clear();
        backwardTxn.UpdateState();
        const mirroredTxn = backwardTxn.CloneGeometryContext();
        backwardTxn.AddOp(() => {
          const [moved, mirroredLength] = reduceGapToNeighbors(
            ctx,
            node,
            mirroredTxn,
            {
              axis: options.axis,
              direction: oppositeDirection(options.direction),
              costTxn: options.costTxn ?? null,
            },
          );
          if (
            moved &&
            mirroredLength < candidateLength &&
            mirroredLength < oldLength
          )
            return;
          throw ErrNonImprovingCandidate;
        });
        try {
          backwardTxn.Commit(ctx);
          return;
        } catch (e) {
          if (!IsCandidateRejection(e)) throw e;
        }
      }
      if (candidateLength >= oldLength) throw ErrNonImprovingCandidate;
    });
    try {
      txn.Commit(ctx);
    } catch (e) {
      txn.Clear();
      if (e === ErrNonImprovingCandidate) break;
      if (e !== ErrInvalidCandidate) throw e;
      continue;
    }
    newLength = candidateLength;
    txn.Clear();
    txn.UpdateState();
    break;
  }
  if (
    node.Container &&
    node.Container !== ahead.Container &&
    !node.FixedTopLeft
  ) {
    while (node.container() !== ahead.container()) {
      const container = node.Container!;
      const box = InnerBox(container);
      let gap: number;
      if (horizontal)
        gap = forwards
          ? box.TopLeft!.X + box.Width - (node.TopLeft!.X + node.Width)
          : node.TopLeft!.X - box.TopLeft!.X;
      else
        gap = forwards
          ? box.TopLeft!.Y + box.Height - (node.TopLeft!.Y + node.Height)
          : node.TopLeft!.Y - box.TopLeft!.Y;
      const padding = containerPadding(graph, container, true);
      let delta =
        gap -
        (horizontal
          ? forwards
            ? padding.right
            : padding.left
          : forwards
            ? padding.bottom
            : padding.top);
      if (!forwards) delta = -delta;
      if (gap > largeGapThreshold * graph.CellSize && delta !== 0) {
        if (!txn)
          txn = NewTransaction(ctx, graph, {
            AffectContainers: true,
            IgnoreContainerEscape: false,
            AffectEdgeRoutes: false,
          });
        else {
          txn.Clear();
          txn.UpdateState();
        }
        const moving = node;
        const addMove = () =>
          txn!.AddOp(() =>
            moveNodeWithChildren(
              moving,
              horizontal ? delta : 0,
              horizontal ? 0 : delta,
            ),
          );
        addMove();
        let rolledBack = false;
        try {
          txn.Commit(ctx);
        } catch (e) {
          if (!IsCandidateRejection(e)) throw e;
          rolledBack = true;
        }
        if (!rolledBack) {
          let movedLength: number;
          try {
            movedLength = EdgeLength(ctx, graph, costOptions);
          } catch (e) {
            txn.Rollback();
            throw e;
          }
          if (PrecisionCompare(movedLength, newLength, PRECISION) >= 0) {
            txn.Rollback();
            rolledBack = true;
          } else newLength = movedLength;
        }
        if (rolledBack) {
          txn.Clear();
          let least = Infinity;
          for (const other of graph.Containers.get(node.container()) ?? []) {
            if (node === other) continue;
            if (horizontal) {
              if (forwards) {
                const x = other.TopLeft!.X - IdealGapSize;
                if (x > node.TopLeft!.X + node.Width)
                  least = Math.min(least, x - (node.TopLeft!.X + node.Width));
              } else {
                const x = other.TopLeft!.X + other.Width + IdealGapSize;
                if (x < node.TopLeft!.X)
                  least = Math.min(least, node.TopLeft!.X - x);
              }
            } else if (forwards) {
              const y = other.TopLeft!.Y - IdealGapSize;
              if (y > node.TopLeft!.Y + node.Height)
                least = Math.min(least, y - (node.TopLeft!.Y + node.Height));
            } else {
              const y = other.TopLeft!.Y + other.Height + IdealGapSize;
              if (y < node.TopLeft!.Y)
                least = Math.min(least, node.TopLeft!.Y - y);
            }
          }
          if (least !== Infinity) {
            delta = forwards ? least : -least;
            addMove();
            let success = true;
            try {
              txn.Commit(ctx);
            } catch (e) {
              if (!IsCandidateRejection(e)) throw e;
              success = false;
            }
            if (success) {
              let movedLength: number;
              try {
                movedLength = EdgeLength(ctx, graph, costOptions);
              } catch (e) {
                txn.Rollback();
                throw e;
              }
              if (PrecisionCompare(movedLength, newLength, PRECISION) >= 0)
                txn.Rollback();
              else {
                newLength = movedLength;
                txn.Clear();
                txn.UpdateState();
              }
            }
          }
        }
      }
      node = node.container()!;
      if (!node.Container) break;
    }
  }
  return [newLength !== oldLength, newLength];
}

export interface GapNormalizationOptions {
  axis: LayoutAxis;
  direction: TraversalDirection;
  costTxn: Transaction | null;
}
export function gapNormalization(
  ctx: Context,
  nodes: Node[],
  txn: Transaction,
  graph: import('../layoutgraph/graph.js').Graph,
  options: GapNormalizationOptions,
): boolean {
  if (!axisValid(options.axis))
    throw new Error('TALA GapNormalization requires an axis');
  if (!directionValid(options.direction))
    throw new Error('TALA GapNormalization requires a direction');
  [ctx] = EnsureTransactionWorkGuard(ctx, 'GapNormalizationTransactions');
  const sorted = [...nodes].sort(
    (a, b) =>
      b.Edges.length - a.Edges.length ||
      (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0),
  );
  let changed = false;
  for (const node of sorted) {
    if (graph.NodeToTree.has(node) || node.Hierarchy) continue;
    const candidateTxn = txn.CloneGeometryContext();
    txn.AddOp(() => {
      reduceGapToNeighbors(ctx, node, candidateTxn, {
        axis: options.axis,
        direction: options.direction,
        attemptRecoverSymmetry: true,
        costTxn: options.costTxn,
      });
    });
    let committed = true;
    try {
      txn.Commit(ctx);
    } catch (e) {
      if (!IsCandidateRejection(e)) throw e;
      committed = false;
    }
    if (committed) {
      txn.UpdateState();
      changed = true;
    }
    txn.Clear();
  }
  return changed;
}
export function NormalizeGaps(
  ctx: Context,
  graph: import('../layoutgraph/graph.js').Graph,
): boolean {
  let guard: import('../limits/work.js').WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(
    ctx,
    'GapNormalizationTransactions',
  );
  const txn = NewTransaction(ctx, graph, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  const state = txn.PreservePriorGraphState(),
    cellSize = graph.CellSize;
  const costs = {
    crossingCost: graph.crossingCost,
    turnCost: graph.turnCost,
    nonCenterPortCost: graph.nonCenterPortCost,
  };
  let complete = false;
  try {
    const bidirectional = (nodes: Node[], axis: LayoutAxis): boolean => {
      const forward = gapNormalization(ctx, nodes, txn, graph, {
        axis,
        direction: TraversalDirection.Forward,
        costTxn: txn,
      });
      const backward = gapNormalization(ctx, nodes, txn, graph, {
        axis,
        direction: TraversalDirection.Backward,
        costTxn: txn,
      });
      return forward || backward;
    };
    let changed = false;
    const containers = graph.containerRDFSOrderContext(null, guard);
    for (const container of containers) {
      const nodes = allDescendantNodesGuarded(
        graph,
        container,
        false,
        unboundedWork,
      );
      for (const axis of [LayoutAxis.Horizontal, LayoutAxis.Vertical])
        if (bidirectional(nodes, axis)) changed = true;
    }
    for (const axis of [LayoutAxis.Horizontal, LayoutAxis.Vertical])
      if (bidirectional(graph.Nodes, axis)) changed = true;
    graph.turnCost = 0;
    SyncSequences(graph);
    SyncClusters(graph);
    guard.Finish();
    complete = true;
    return changed;
  } finally {
    if (!complete) {
      RollbackGraphState(graph, state);
      graph.CellSize = cellSize;
      if (!txn.RestorePlacementCosts()) Object.assign(graph, costs);
    }
  }
}
