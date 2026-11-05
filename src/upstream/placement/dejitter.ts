// Translated from internal/placement/dejitter.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { passesThrough, isPointOnNode } from '../layoutgraph/node-spatial.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import {
  ErrInvalidCandidate,
  ErrNonImprovingCandidate,
  IsCandidateRejection,
} from '../layoutgraph/errors.js';
import { NodeSymmetry } from '../placementcost/symmetry.js';
import { jitterThreshold, signFlipPadding } from './tuning.js';
function spillsOutOf(node: Node, container: Node): boolean {
  const x = node.TopLeft!.X,
    y = node.TopLeft!.Y;
  const corners = [
    new Point(x, y),
    new Point(x + node.Width, y),
    new Point(x + node.Width, y + node.Height),
    new Point(x, y + node.Height),
  ];
  const inside = corners.map((p) => isPointOnNode(container, p));
  return inside.some(Boolean) && inside.some((x) => !x);
}
export function Dejitter(ctx: Context, g: Graph): boolean {
  let guard: import('../limits/work.js').WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(ctx, 'DejitterTransactions');
  const txn = NewTransaction(ctx, g, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  if (g.Nodes.length === 0) return false;
  let dejittered = false,
    rollback: GraphState | null = null,
    complete = false;
  try {
    for (const node of g.Nodes) {
      if (
        node.Cluster ||
        node.isContainer ||
        g.NodeToTree.has(node) ||
        node.Sequence ||
        node.FixedTopLeft
      )
        continue;
      const previousSymmetry = NodeSymmetry(ctx, node, null);
      for (const edge of node.Edges) {
        if (edge.Points.length - 1 < 3 || node.Adjacent(edge).Cluster) continue;
        const from = edge.From === node,
          points = edge.Points,
          len = points.length;
        const first = points[from ? 1 : len - 2]!,
          second = points[from ? 2 : len - 3]!,
          before = points[from ? 3 : len - 4]!,
          port = points[from ? 0 : len - 1]!;
        if (
          Math.hypot(first.X - second.X, first.Y - second.Y) > jitterThreshold
        )
          continue;
        const vertical = first.Y === second.Y;
        if (
          vertical
            ? (before.Y > first.Y && port.Y > first.Y) ||
              (before.Y < first.Y && port.Y < first.Y)
            : (before.X > first.X && port.X > first.X) ||
              (before.X < first.X && port.X < first.X)
        )
          continue;
        if (vertical ? first.X === second.X : first.Y === second.Y) continue;
        let straight = false;
        for (const other of node.Edges) {
          if (other === edge || other.Points.length - 1 > 1) continue;
          const i = other.From === node ? 0 : other.Points.length - 1,
            j = other.From === node ? 1 : other.Points.length - 2;
          if (
            vertical
              ? other.Points[i]!.X === other.Points[j]!.X
              : other.Points[i]!.Y === other.Points[j]!.Y
          ) {
            straight = true;
            break;
          }
        }
        if (straight) continue;
        const delta = Round(vertical ? second.X - first.X : second.Y - first.Y),
          flipDelta = delta + (delta < 0 ? -signFlipPadding : signFlipPadding);
        let signFlip = false;
        const newSegments = new Map<Edge, [Point, Point]>();
        for (const other of node.Edges) {
          const p = other.Points,
            own = other.From === node,
            i = own ? 0 : p.length - 1,
            j = own ? 1 : p.length - 2,
            k = own ? 2 : p.length - 3;
          const a = p[i]!,
            b = p[j]!,
            otherVertical = a.X === b.X;
          if (p.length === 2 && p[0]!.X !== p[1]!.X && p[0]!.Y !== p[1]!.Y)
            continue;
          const same = vertical === otherVertical;
          const newA = new Point(
            a.X + (vertical ? delta : 0),
            a.Y + (vertical ? 0 : delta),
          );
          const newB = same
            ? new Point(
                b.X + (vertical ? delta : 0),
                b.Y + (vertical ? 0 : delta),
              )
            : b;
          newSegments.set(other, [newA, newB]);
          if (!same || other !== edge) {
            const current = same ? b : a,
              reference = same ? p[k]! : b;
            const value = vertical ? current.X : current.Y,
              target = vertical ? reference.X : reference.Y;
            if (
              (value + flipDelta < target && value > target) ||
              (value + flipDelta > target && value < target)
            )
              signFlip = true;
          }
          if (signFlip) break;
        }
        if (signFlip) continue;
        let intersects = false;
        for (const [segmentEdge, segment] of newSegments) {
          for (const other of g.Nodes) {
            if (
              other === node ||
              isDescendantOf(segmentEdge.From!, other) ||
              isDescendantOf(segmentEdge.To!, other)
            )
              continue;
            if (
              other !== segmentEdge.To &&
              other !== segmentEdge.From &&
              passesThrough(other, segment[0], segment[1])
            ) {
              intersects = true;
              break;
            }
          }
          if (intersects) break;
        }
        if (intersects) continue;
        const crossings = (): number => {
          let count = 0;
          for (const other of g.Edges) {
            if (other.From === node || other.To === node) continue;
            for (let i = 0; i < other.Points.length - 1; i++)
              if (passesThrough(node, other.Points[i]!, other.Points[i + 1]!))
                count++;
          }
          return count;
        };
        const beforeCrossings = crossings();
        if (!rollback) {
          rollback = new GraphState({
            CaptureTopology: false,
            CaptureEdgeRoutes: true,
          });
          rollback.UpdateWithWorkGuard(g, guard);
        }
        txn.AddOp(() => {
          if (vertical) node.TopLeft!.X += delta;
          else node.TopLeft!.Y += delta;
          const afterCrossings = crossings(),
            symmetry = NodeSymmetry(ctx, node, null);
          if (afterCrossings > beforeCrossings) throw ErrNonImprovingCandidate;
          if (node.Container && spillsOutOf(node, node.Container))
            throw ErrInvalidCandidate;
          if (symmetry < previousSymmetry) throw ErrNonImprovingCandidate;
        });
        try {
          txn.Commit(ctx);
        } catch (e) {
          txn.Clear();
          if (IsCandidateRejection(e)) continue;
          throw e;
        }
        txn.UpdateState();
        txn.Clear();
        for (const other of node.Edges) {
          const p = other.Points,
            own = other.From === node,
            i = own ? 0 : p.length - 1,
            j = own ? 1 : p.length - 2;
          const otherVertical = p[i]!.X === p[j]!.X;
          const diagonal =
            p.length === 2 && p[0]!.X !== p[1]!.X && p[0]!.Y !== p[1]!.Y;
          if (vertical) {
            p[i]!.X += delta;
            if (!diagonal && otherVertical) p[j]!.X += delta;
          } else {
            p[i]!.Y += delta;
            if (!diagonal && !otherVertical) p[j]!.Y += delta;
          }
        }
        edge.Points = from
          ? [edge.Points[0]!, ...edge.Points.slice(3)]
          : [...edge.Points.slice(0, -3), edge.Points[edge.Points.length - 1]!];
        dejittered = true;
      }
    }
    if (dejittered) guard.Finish();
    complete = true;
    return dejittered;
  } finally {
    if (rollback && !complete) RollbackGraphState(g, rollback);
  }
}
