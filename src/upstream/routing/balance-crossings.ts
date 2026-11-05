// Translated from internal/routing/balance_crossings.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import type { RouteWorkGuard } from './stage-guard.js';
import type { BalancedEdgeSegment } from './balance-geometry.js';
import { isNonSharedCrossing } from './cost.js';
export function balanceCollinearOverlap(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): number {
  if (a.X === b.X && c.X === d.X && a.X === c.X)
    return Math.max(
      0,
      Math.min(Math.max(a.Y, b.Y), Math.max(c.Y, d.Y)) -
        Math.max(Math.min(a.Y, b.Y), Math.min(c.Y, d.Y)),
    );
  if (a.Y === b.Y && c.Y === d.Y && a.Y === c.Y)
    return Math.max(
      0,
      Math.min(Math.max(a.X, b.X), Math.max(c.X, d.X)) -
        Math.max(Math.min(a.X, b.X), Math.min(c.X, d.X)),
    );
  return 0;
}
export function balanceReversalRemovesCrossings(
  g: Graph,
  batch: BalancedEdgeSegment[],
  proposed: number[],
  horizontal: boolean,
  guard: RouteWorkGuard,
): boolean {
  const copies = new Map<Point, Point>();
  for (let i = 0; i < batch.length; i++) {
    guard.Step();
    for (const point of [batch[i]!.Start, batch[i]!.End]) {
      guard.Step();
      const candidate = point.Copy();
      if (horizontal) candidate.X = proposed[i]!;
      else candidate.Y = proposed[i]!;
      const previous = copies.get(point);
      if (previous && !previous.Equals(candidate)) return false;
      copies.set(point, candidate);
    }
  }
  guard.Add(BigInt(g.Edges.length));
  const candidates: (Edge | null)[] = new Array(g.Edges.length).fill(null),
    affected: number[] = [];
  for (let i = 0; i < g.Edges.length; i++) {
    guard.Step();
    const edge = g.Edges[i]!;
    let changed = false;
    for (const point of edge.Points) {
      guard.Step();
      const candidate = copies.get(point);
      if (candidate && !candidate.Equals(point)) changed = true;
    }
    if (!changed) continue;
    if (edge.IsCurve) return false;
    guard.Add(BigInt(edge.Points.length));
    const candidate = Object.assign(new Edge(edge.From, edge.To), edge);
    candidate.Points = [];
    for (let j = 0; j < edge.Points.length; j++) {
      guard.Step();
      const point = edge.Points[j]!,
        replacement = copies.get(point) ?? point;
      candidate.Points.push(replacement);
      if (j > 0) {
        const before = edge.Points[j - 1]!,
          after = candidate.Points[j - 1]!;
        if (
          (before.X !== point.X && before.Y !== point.Y) ||
          (after.X !== replacement.X && after.Y !== replacement.Y)
        )
          return false;
      }
    }
    candidates[i] = candidate;
    affected.push(i);
  }
  let improved = false;
  for (const i of affected) {
    guard.Step();
    for (let j = 0; j < g.Edges.length; j++) {
      guard.Step();
      const other = g.Edges[j]!;
      if (i === j || (candidates[j] && j < i)) continue;
      if (other.IsCurve) return false;
      const otherCandidate = candidates[j] ?? other;
      let before = 0,
        after = 0;
      for (let a = 0; a + 1 < g.Edges[i]!.Points.length; a++) {
        guard.Step();
        for (let b = 0; b + 1 < other.Points.length; b++) {
          guard.Step();
          if (isNonSharedCrossing(g.Edges[i]!, other, a, b)) before++;
          if (isNonSharedCrossing(candidates[i]!, otherCandidate, a, b))
            after++;
          const oldOverlap = balanceCollinearOverlap(
              g.Edges[i]!.Points[a]!,
              g.Edges[i]!.Points[a + 1]!,
              other.Points[b]!,
              other.Points[b + 1]!,
            ),
            nextOverlap = balanceCollinearOverlap(
              candidates[i]!.Points[a]!,
              candidates[i]!.Points[a + 1]!,
              otherCandidate.Points[b]!,
              otherCandidate.Points[b + 1]!,
            );
          if (oldOverlap === 0 && nextOverlap > 0) return false;
        }
      }
      if (after > before) return false;
      if (after < before) improved = true;
    }
  }
  return improved;
}
