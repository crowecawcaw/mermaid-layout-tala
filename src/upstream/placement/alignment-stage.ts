// Translated internal/placement/alignment.go and Align stage from stages.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Point } from '../geo/point.js';
import { Round, PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { IsHorizontal, IsVertical } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { EdgeAbduction, Sequence } from '../layoutgraph/records.js';
import {
  nodeOrientation,
  orthogonalDistanceTo,
} from '../layoutgraph/node-spatial.js';
import {
  hasTableColumn,
  isAxisAligned,
  facingTablePorts,
} from '../layoutgraph/ports.js';
import { ConnectedNodeGap } from '../layoutgraph/geometry-policy.js';
import { ConnectedNodeSet } from '../layoutgraph/connected-set.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
  type Transaction,
} from '../layoutgraph/transaction.js';
import {
  ErrInvalidCandidate,
  IsCandidateRejection,
} from '../layoutgraph/errors.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { ContainerAlignmentCost } from '../placementcost/graph-cost.js';
import { treeEdgeMap } from '../routing/coordinator.js';
import { withinMaxSize, intersectsOtherNode } from './metrics.js';
function abducted(sequence: Sequence, edge: Edge): Node | null {
  for (const a of sequence.EdgeAbductions) {
    if (a.Edge !== edge) continue;
    if (a.CurrentFrom === sequence.Vessel) return a.OriginallyFrom;
    if (a.CurrentTo === sequence.Vessel) return a.OriginallyTo;
  }
  return null;
}
export function alignmentDeltas(edge: Edge, g: Graph): [number, number] {
  if (hasTableColumn(edge)) {
    const p = facingTablePorts(edge, null, null);
    if (p.hasFrom && p.hasTo) return [0, p.to.Y - p.from.Y];
    if (p.hasFrom)
      return [0, edge.To.TopLeft!.Y + edge.To.Height / 2 - p.from.Y];
    if (p.hasTo)
      return [0, p.to.Y - (edge.From.TopLeft!.Y + edge.From.Height / 2)];
    return [edge.To.TopLeft!.X - edge.From.TopLeft!.X, 0];
  }
  let from = edge.From,
    to = edge.To;
  const a = g.Sequences.get(from),
    b = g.Sequences.get(to);
  if (a) from = abducted(a, edge)!;
  if (b) to = abducted(b, edge)!;
  let dy = Round(
      to.TopLeft!.Y + to.Height / 2 - (from.TopLeft!.Y + from.Height / 2),
    ),
    dx = Round(
      to.TopLeft!.X + to.Width / 2 - (from.TopLeft!.X + from.Width / 2),
    );
  const orientation = nodeOrientation(edge.From, edge.To);
  if (IsHorizontal(orientation)) dx = 0;
  else if (IsVertical(orientation)) dy = 0;
  else {
    const [x, y] = orthogonalDistanceTo(edge.From, edge.To);
    if (x < ConnectedNodeGap) dy = 0;
    if (y < ConnectedNodeGap) dx = 0;
  }
  return [dx, dy];
}
export function attemptShift(
  g: Graph,
  edge: Edge,
  nodes: Node[],
  x: number,
  y: number,
): boolean {
  for (const node of nodes) node.Translate(x, y);
  return withinMaxSize(g) && !intersectsOtherNode(g, edge.From, edge.To);
}
export function tryMove(
  ctx: Context,
  txn: Transaction,
  g: Graph,
  edge: Edge,
  nodes: Node[],
  abductions: EdgeAbduction[] | null,
  dx: number,
  dy: number,
): [number, number, number] {
  let best = Infinity,
    attempt = new Point(0, 0);
  const attempts: Point[] = [];
  if (PrecisionCompare(dy, 0, PRECISION) !== 0) attempts.push(new Point(0, dy));
  if (PrecisionCompare(dx, 0, PRECISION) !== 0) attempts.push(new Point(dx, 0));
  const options = {
    EdgeAbductions: abductions,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: true,
  };
  for (const p of attempts) {
    txn.AddOp(() => {
      if (!attemptShift(g, edge, nodes, p.X, p.Y)) throw ErrInvalidCandidate;
    });
    let committed = false;
    try {
      txn.Commit(ctx);
      committed = true;
    } catch (error) {
      if (!IsCandidateRejection(error)) throw error;
    }
    if (committed) {
      let value: number;
      try {
        value = EdgeLength(ctx, g, options) + ContainerAlignmentCost(ctx, g);
      } catch (error) {
        txn.Rollback();
        txn.Clear();
        throw error;
      }
      if (PrecisionCompare(value, best, PRECISION) < 1) {
        best = value;
        attempt = p.Copy();
      }
    }
    txn.Clear();
    txn.Rollback();
  }
  return [best, attempt.X, attempt.Y];
}
export function alignAxes(ctx: Context, g: Graph, txn: Transaction): boolean {
  const error = ctx.Err();
  if (error) throw error;
  let changed = false;
  const treeEdges = treeEdgeMap(g),
    excluded: (Node | null)[] = [];
  for (const n of g.Nodes) if (g.NodeToTree.has(n)) excluded.push(n);
  excluded.push(...g.Nodes.filter((n) => n.FixedTopLeft !== null), null);
  let abductions: EdgeAbduction[] | null = null;
  for (const sequence of g.Sequences.values())
    if (sequence.EdgeAbductions.length) {
      abductions ??= [];
      abductions.push(...sequence.EdgeAbductions);
    }
  const options = {
    EdgeAbductions: abductions,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: true,
  };
  let hasTables = false,
    initialAligned = 0;
  const initial = EdgeLength(ctx, g, options);
  for (const edge of g.Edges)
    if (hasTableColumn(edge)) {
      hasTables = true;
      if (isAxisAligned(edge)) initialAligned++;
    }
  for (const edge of g.Edges) {
    if (
      treeEdges.has(edge) ||
      isAxisAligned(edge) ||
      edge.From.Hierarchy ||
      edge.To.Hierarchy
    )
      continue;
    txn.Clear();
    txn.UpdateState();
    const [x, y] = alignmentDeltas(edge, g);
    let dx = 0,
      dy = 0,
      bestNodes: Node[] | null = null,
      best = EdgeLength(ctx, g, options) + ContainerAlignmentCost(ctx, g);
    excluded[excluded.length - 1] = edge.To;
    const from = ConnectedNodeSet(edge.From, excluded, g),
      [length1, x1, y1] = tryMove(ctx, txn, g, edge, from, abductions, x, y),
      cmp1 = PrecisionCompare(length1, best, PRECISION);
    if (cmp1 < 0 || (hasTableColumn(edge) && cmp1 === 0)) {
      best = length1;
      dx = x1;
      dy = y1;
      bestNodes = from;
    }
    excluded[excluded.length - 1] = edge.From;
    const to = ConnectedNodeSet(edge.To, excluded, g),
      [length2, x2, y2] = tryMove(ctx, txn, g, edge, to, abductions, -x, -y),
      cmp2 = PrecisionCompare(length2, best, PRECISION);
    if (cmp2 < 0 || (hasTableColumn(edge) && cmp2 === 0)) {
      dx = x2;
      dy = y2;
      bestNodes = to;
    }
    if (bestNodes?.length) {
      const selected = bestNodes;
      txn.AddOp(() => {
        changed = true;
        for (const node of selected) node.Translate(dx, dy);
      });
      txn.Commit(ctx);
    }
  }
  if (hasTables && changed) {
    let aligned = 0;
    for (const edge of g.Edges)
      if (hasTableColumn(edge) && isAxisAligned(edge)) aligned++;
    if (aligned <= initialAligned)
      changed =
        PrecisionCompare(
          EdgeLength(ctx, g, options) + ContainerAlignmentCost(ctx, g),
          initial,
          PRECISION,
        ) === -1;
  }
  return changed;
}
export function Align(ctx: Context, g: Graph): void {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'AlignAxesTransactions');
  if (g.CellSize === 0) g.ComputeCellSize();
  const txn = NewTransaction(ctx, g, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  for (let i = 0; i < 100; i++) if (!alignAxes(ctx, g, txn)) break;
}
