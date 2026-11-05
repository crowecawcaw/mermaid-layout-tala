// Translated from internal/routing/coordinator.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Point } from '../geo/point.js';
import { orientation } from './geometry.js';
function isStraight(e: Edge): boolean {
  let p = e.Points[0]!,
    q = e.Points[1]!;
  for (let i = 2; i < e.Points.length; i++) {
    if (orientation(p, q, e.Points[i]!) !== 0) return false;
    p = q;
    q = e.Points[i]!;
  }
  return true;
}
function duplicate(a: Edge, b: Edge): boolean {
  return (
    (a.From === b.From && a.To === b.To) || (a.From === b.To && a.To === b.From)
  );
}
function hasOverlappingEnd(e: Edge): boolean {
  const start = e.Points[0]!,
    end = e.Points[e.Points.length - 1]!;
  for (const other of e.From.Edges)
    if (
      other !== e &&
      (other.Points[0]!.Equals(start) ||
        other.Points[other.Points.length - 1]!.Equals(start))
    )
      return true;
  for (const other of e.To.Edges)
    if (
      other !== e &&
      (other.Points[0]!.Equals(end) ||
        other.Points[other.Points.length - 1]!.Equals(end))
    )
      return true;
  return false;
}
export function ReorderDuplicates(ctx: Context, g: Graph): void {
  reorderDuplicatesInEdges(ctx, g.Edges);
}
export function reorderDuplicatesInEdges(ctx: Context, edges: Edge[]): void {
  const check = () => {
    const error = ctx.Err();
    if (error)
      throw new Error(`ReorderDuplicates: ${error.message}`, { cause: error });
  };
  check();
  const snapshots = new Map<Edge, { points: Point[]; values: Point[] }>();
  for (const e of edges)
    if (!snapshots.has(e))
      snapshots.set(e, { points: e.Points, values: [...e.Points] });
  let complete = false;
  try {
    for (const e of edges) {
      check();
      if (e.FromTableColumnIndex !== null || e.ToTableColumnIndex !== null)
        continue;
      if (!e.Label || !isStraight(e)) continue;
      const overlap = hasOverlappingEnd(e),
        duplicates: Edge[] = [];
      for (const other of edges) {
        check();
        if (other === e || !duplicate(other, e) || !isStraight(other)) continue;
        if (overlap || hasOverlappingEnd(other)) {
          let source = e.SourceArrowhead,
            target = e.TargetArrowhead;
          if (other.From === e.To) [source, target] = [target, source];
          if (
            other.TargetArrowhead === target &&
            other.SourceArrowhead === source
          )
            duplicates.push(other);
        } else duplicates.push(other);
      }
      if (duplicates.length <= 1) continue;
      const start = e.Points[0]!,
        end = e.Points[e.Points.length - 1]!,
        dx = end.X - start.X,
        dy = end.Y - start.Y,
        sourceOrder = [e, ...duplicates],
        targetOrder = [e, ...duplicates];
      if (dy > dx) {
        sourceOrder.sort((a, b) => a.Points[0]!.X - b.Points[0]!.X);
        targetOrder.sort(
          (a, b) =>
            a.Points[a.Points.length - 1]!.X - b.Points[b.Points.length - 1]!.X,
        );
      } else {
        sourceOrder.sort((a, b) => a.Points[0]!.Y - b.Points[0]!.Y);
        targetOrder.sort(
          (a, b) =>
            a.Points[a.Points.length - 1]!.Y - b.Points[b.Points.length - 1]!.Y,
        );
      }
      check();
      if (sourceOrder.some((item, i) => item !== targetOrder[i])) continue;
      const index = sourceOrder.indexOf(e);
      if (index === 0 || index === sourceOrder.length - 1) continue;
      const first = sourceOrder[0]!,
        last = sourceOrder[sourceOrder.length - 1]!;
      if (first.Label && last.Label) continue;
      check();
      const selected = !last.Label ? last : !first.Label ? first : null;
      if (selected) {
        [e.Points, selected.Points] = [selected.Points, e.Points];
        if (selected.From === e.To) {
          e.Points.reverse();
          selected.Points.reverse();
        }
      }
    }
    check();
    complete = true;
  } finally {
    if (!complete)
      for (const [edge, snapshot] of snapshots) {
        for (let i = 0; i < snapshot.values.length; i++)
          snapshot.points[i] = snapshot.values[i]!;
        edge.Points = snapshot.points;
      }
  }
}
