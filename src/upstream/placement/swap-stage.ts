// Translated internal/placement/swap.go and Swap stage from stages.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Orientation as O } from '../geo/orientation.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import {
  moveNodeWithChildren,
  moveNodeAbsWithChildren,
} from '../layoutgraph/containment.js';
import { dfsWalk } from '../layoutgraph/group-geometry.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { NodeEdgeLength } from '../placementcost/edge-length.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { GraphEdgeCrossings } from '../placementcost/graph-cost.js';
import { ColumnCrossingCost } from '../placementcost/column-crossing.js';
import { NodeSymmetry } from '../placementcost/symmetry.js';
import { direct } from './direct.js';
export function swapPositions(a: Node, b: Node): void {
  const x = a.TopLeft!.X,
    y = a.TopLeft!.Y;
  moveNodeWithChildren(
    a,
    b.TopLeft!.X - a.TopLeft!.X,
    b.TopLeft!.Y - a.TopLeft!.Y,
  );
  moveNodeWithChildren(b, x - b.TopLeft!.X, y - b.TopLeft!.Y);
}
export function smartSwapPositions(a: Node, b: Node): void {
  const x = a.TopLeft!.X,
    y = a.TopLeft!.Y,
    o = nodeOrientation(a, b);
  switch (o) {
    case O.Left:
      moveNodeAbsWithChildren(
        a,
        b.TopLeft!.X + b.Width - a.Width,
        a.TopLeft!.Y,
      );
      moveNodeAbsWithChildren(b, x, b.TopLeft!.Y);
      break;
    case O.Right:
      moveNodeAbsWithChildren(a, b.TopLeft!.X, a.TopLeft!.Y);
      moveNodeAbsWithChildren(b, x + a.Width - b.Width, b.TopLeft!.Y);
      break;
    case O.Top:
      moveNodeAbsWithChildren(
        a,
        a.TopLeft!.X,
        b.TopLeft!.Y + b.Height - a.Height,
      );
      moveNodeAbsWithChildren(b, b.TopLeft!.X, y);
      break;
    case O.Bottom:
      moveNodeAbsWithChildren(a, a.TopLeft!.X, b.TopLeft!.Y);
      moveNodeAbsWithChildren(b, b.TopLeft!.X, y + a.Height - b.Height);
      break;
    case O.TopLeft:
      moveNodeAbsWithChildren(
        a,
        b.TopLeft!.X + b.Width - a.Width,
        b.TopLeft!.Y + b.Height - a.Height,
      );
      moveNodeAbsWithChildren(b, x, y);
      break;
    case O.TopRight:
      moveNodeAbsWithChildren(
        a,
        b.TopLeft!.X,
        b.TopLeft!.Y + b.Height - a.Height,
      );
      moveNodeAbsWithChildren(b, x + a.Width - b.Width, y);
      break;
    case O.BottomLeft:
      moveNodeAbsWithChildren(
        a,
        b.TopLeft!.X + b.Width - a.Width,
        b.TopLeft!.Y,
      );
      moveNodeAbsWithChildren(b, x, y + a.Height - b.Height);
      break;
    case O.BottomRight:
      moveNodeAbsWithChildren(a, b.TopLeft!.X, b.TopLeft!.Y);
      moveNodeAbsWithChildren(
        b,
        x + a.Width - b.Width,
        y + a.Height - b.Height,
      );
      break;
  }
}
function hasLeakyEdge(node: Node): boolean {
  if (!node.IsContainer()) return false;
  let found = false;
  dfsWalk(node, (descendant) => {
    if (descendant === node) return false;
    for (const edge of descendant.Edges)
      if (!isDescendantOf(descendant.Adjacent(edge), node)) {
        found = true;
        return true;
      }
    return false;
  });
  return found;
}
export function swapOptimize(ctx: Context, nodes: Node[], g: Graph): boolean {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'SwapOptimizeTransactions');
  const symmetryCost = g.CellSize,
    options = {
      EdgeAbductions: null,
      IncludeNodeSizes: true,
      EnforceMinimumGap: false,
      PenalizeDirection: true,
    };
  let changed = false;
  const measure = (node: Node) =>
    NodeEdgeLength(ctx, node, options) +
    ColumnCrossingCost(ctx, node, null) -
    NodeSymmetry(ctx, node, null) * symmetryCost * node.Edges.length;
  const txn = NewTransaction(ctx, g, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  for (const node of nodes) {
    if (
      g.NodeToTree.has(node) ||
      node.Hierarchy ||
      node.FixedTopLeft ||
      (node.Edges.length === 0 && !hasLeakyEdge(node))
    )
      continue;
    let bestSmart = false,
      best: Node | null = null,
      bestLength = Infinity;
    const currentGlobal = EdgeLength(ctx, g, options),
      currentLocal = measure(node),
      currentCross = GraphEdgeCrossings(ctx, g);
    for (const candidate of g.Containers.get(node.Container) ?? []) {
      if (
        candidate === node ||
        g.NodeToTree.has(candidate) ||
        candidate.Hierarchy ||
        candidate.FixedTopLeft
      )
        continue;
      const evaluate = (smart: boolean): [number, number, number] => {
        let local = 0,
          global = 0,
          crossings = 0;
        txn.AddOp(() => {
          if (smart) smartSwapPositions(node, candidate);
          else swapPositions(node, candidate);
        });
        let committed = false;
        try {
          txn.Commit(ctx);
          committed = true;
        } catch (error) {
          if (!IsCandidateRejection(error)) throw error;
        }
        if (committed) {
          try {
            local = measure(node);
            global = EdgeLength(ctx, g, options);
            crossings = GraphEdgeCrossings(ctx, g);
          } catch (error) {
            txn.Rollback();
            txn.Clear();
            throw error;
          }
        }
        txn.Rollback();
        txn.Clear();
        return [local, global, crossings];
      };
      const [l, g1, c] = evaluate(false),
        [sl, sg, sc] = evaluate(true);
      if (g1 === 0 && sg === 0) continue;
      const better = (value: number, other: number) =>
        PrecisionCompare(value, other, PRECISION) < 0;
      const accept = (
        smart: boolean,
        local: number,
        global: number,
        crossings: number,
        needLocal: boolean,
      ): void => {
        if (
          crossings <= currentCross &&
          (!needLocal || better(local, currentLocal)) &&
          better(global, currentGlobal) &&
          better(global, bestLength)
        ) {
          bestLength = global;
          bestSmart = smart;
          best = candidate;
        }
      };
      if (l !== 0 && sl === 0) accept(false, l, g1, c, true);
      else if (sl !== 0 && l === 0) accept(true, sl, sg, sc, true);
      else if (l !== 0 && sl !== 0) {
        if (better(sl, l)) accept(true, sl, sg, sc, true);
        else accept(false, l, g1, c, true);
      } else if (g1 !== 0 && sg === 0) accept(false, l, g1, c, false);
      else if (g1 === 0 && sg !== 0) accept(true, sl, sg, sc, false);
      else if (better(g1, sg)) accept(false, l, g1, c, false);
      else accept(true, sl, sg, sc, false);
    }
    if (best) {
      changed = true;
      const target: Node = best;
      txn.AddOp(() => {
        if (bestSmart) smartSwapPositions(node, target);
        else swapPositions(node, target);
      });
      txn.Commit(ctx);
      txn.Clear();
      txn.UpdateState();
    }
  }
  return changed;
}
export function Swap(ctx: Context, graph: Graph): void {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'SwapStuffTransactions');
  graph.ComputeCellSize();
  for (let i = 0; i < 4; i++) if (!swapOptimize(ctx, graph.Nodes, graph)) break;
  direct(ctx, graph, graph.Nodes, null, { checkEdgeLength: true });
}
