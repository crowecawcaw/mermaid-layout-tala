// Translated internal/placement/symmetry.go and TransposeAll from stages.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { SameSide, IsVertical } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { nodesCenter } from '../layoutgraph/node-geometry.js';
import { moveNodeWithChildren } from '../layoutgraph/containment.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import {
  RollbackGraphState,
  type GraphState,
} from '../layoutgraph/graph-state.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { AxisScore } from '../placementcost/axis.js';
import { transpose } from './transpose.js';
export function isSimple(graph: Graph, node: Node): boolean {
  return !(
    node.IsContainer() ||
    graph.Trees.has(node) ||
    node.IsClusterVessel() ||
    graph.Sequences.has(node) ||
    node.Cluster ||
    node.Hierarchy
  );
}
export function BalanceSymmetry(ctx: Context, g: Graph): void {
  let guard;
  [ctx, guard] = EnsureTransactionWorkGuard(ctx, 'BalanceSymmetryTransactions');
  if (!g.Nodes.length) return;
  let rollback: GraphState | null = null,
    complete = false;
  try {
    for (const node of g.Nodes) {
      if (!isSimple(g, node) || node.Edges.length < 2) continue;
      let same = true;
      const neighbors = new Set<Node>();
      for (let i = 0; i < node.Edges.length - 1; i++) {
        const first = node.Edges[i]!,
          second = node.Edges[i + 1]!;
        if (
          first.FromTableColumnIndex !== null ||
          first.ToTableColumnIndex !== null ||
          second.FromTableColumnIndex !== null ||
          second.ToTableColumnIndex !== null
        )
          continue;
        const a = node.Adjacent(first),
          b = node.Adjacent(second);
        if (!SameSide(nodeOrientation(node, a), nodeOrientation(node, b))) {
          same = false;
          break;
        }
        neighbors.add(a);
        neighbors.add(b);
      }
      if (!same || neighbors.size < 2) continue;
      const adj = [...neighbors];
      if (AxisScore(adj) !== 1) continue;
      let max = -Infinity;
      for (const n of adj) max = Math.max(max, n.Width * n.Height);
      if (adj.some((n) => n.Width * n.Height < 0.5 * max)) continue;
      const horizontal = !IsVertical(nodeOrientation(adj[0]!, adj[1]!)),
        txn = NewTransaction(
          ctx,
          g,
          {
            AffectContainers: true,
            IgnoreContainerEscape: false,
            AffectEdgeRoutes: false,
          },
          guard,
        );
      rollback ??= txn.PriorGraphState;
      txn.AddOp(() => {
        const center = nodesCenter(adj),
          nc = node.Center();
        if (horizontal)
          moveNodeWithChildren(node, Math.floor(center.X - nc.X), 0);
        else moveNodeWithChildren(node, 0, Math.floor(center.Y - nc.Y));
      });
      try {
        txn.Commit(ctx);
      } catch (error) {
        if (!IsCandidateRejection(error)) throw error;
      }
    }
    complete = true;
  } finally {
    if (!complete && rollback) RollbackGraphState(g, rollback);
  }
}
export function TransposeAll(ctx: Context, graph: Graph): void {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'TransposeStageTransactions');
  graph.ComputeCellSize();
  for (const node of graph.Nodes) transpose(ctx, graph, node, null);
}
