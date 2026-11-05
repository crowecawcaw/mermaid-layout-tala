// Translated from internal/routing/nudge_channels.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Segment } from '../geo/segment.js';
import type { Point } from '../geo/point.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Edge } from '../layoutgraph/edge.js';
import type { RouteWorkGuard } from './stage-guard.js';
import { changedRouteIsClear } from './balance-segments.js';
import { balanceCollinearOverlap } from './balance-crossings.js';
import { isNonSharedCrossing } from './cost.js';
import { channelEpsilon } from './channel-constraints.js';

export function channelProposalSafe(
  g: Graph,
  proposal: Map<Point, Point>,
  guard: RouteWorkGuard,
): boolean {
  const candidates: Edge[] = [],
    changed: boolean[] = [];
  for (let index = 0; index < g.Edges.length; index++) {
    const edge = g.Edges[index]!,
      candidate = Object.assign(new Edge(edge.From, edge.To), edge);
    candidate.Points = [...edge.Points];
    changed[index] = false;
    for (let i = 0; i < edge.Points.length; i++) {
      guard.Step();
      const point = edge.Points[i]!,
        p = proposal.get(point);
      if (p) {
        candidate.Points[i] = p;
        changed[index] = changed[index] || !p.Equals(point);
      }
    }
    candidates[index] = candidate;
    if (!changed[index]) continue;
    if (
      edge.IsCurve ||
      !changedRouteIsClear(g, candidate, edge.Points, true, guard)
    )
      return false;
    let beforeLength = 0,
      afterLength = 0;
    const nonzero: Point[] = [];
    for (let i = 0; i < candidate.Points.length; i++) {
      guard.Step();
      const point = candidate.Points[i]!;
      if (!Number.isFinite(point.X) || !Number.isFinite(point.Y)) return false;
      if (i > 0) {
        const old = edge.Points[i - 1]!,
          previous = candidate.Points[i - 1]!;
        const before = Math.hypot(
            edge.Points[i]!.X - old.X,
            edge.Points[i]!.Y - old.Y,
          ),
          after = Math.hypot(point.X - previous.X, point.Y - previous.Y);
        beforeLength += before;
        afterLength += after;
        if (
          after > channelEpsilon &&
          after + channelEpsilon < Math.min(before, 40)
        )
          return false;
      }
      if (!nonzero.length || !nonzero.at(-1)!.Equals(point))
        nonzero.push(point);
    }
    if (afterLength > beforeLength + channelEpsilon) return false;
    for (let i = 2; i < nonzero.length; i++) {
      const a = nonzero[i - 2]!,
        b = nonzero[i - 1]!,
        c = nonzero[i]!;
      if ((b.X - a.X) * (c.X - b.X) + (b.Y - a.Y) * (c.Y - b.Y) < 0)
        return false;
    }
    for (let i = 0; i + 1 < nonzero.length; i++)
      for (let j = i + 2; j + 1 < nonzero.length; j++) {
        guard.Step();
        if (
          new Segment(nonzero[i]!, nonzero[i + 1]!).Intersects(
            new Segment(nonzero[j]!, nonzero[j + 1]!),
          )
        )
          return false;
      }
  }
  for (let i = 0; i < g.Edges.length; i++)
    for (let j = i + 1; j < g.Edges.length; j++) {
      if (!changed[i] && !changed[j]) continue;
      const edge = g.Edges[i]!,
        other = g.Edges[j]!;
      if (edge.IsCurve || other.IsCurve) return false;
      let beforeCrossings = 0,
        afterCrossings = 0;
      for (let a = 0; a + 1 < edge.Points.length; a++)
        for (let b = 0; b + 1 < other.Points.length; b++) {
          guard.Step();
          if (isNonSharedCrossing(edge, other, a, b)) beforeCrossings++;
          if (isNonSharedCrossing(candidates[i]!, candidates[j]!, a, b))
            afterCrossings++;
          const old = balanceCollinearOverlap(
            edge.Points[a]!,
            edge.Points[a + 1]!,
            other.Points[b]!,
            other.Points[b + 1]!,
          );
          const next = balanceCollinearOverlap(
            candidates[i]!.Points[a]!,
            candidates[i]!.Points[a + 1]!,
            candidates[j]!.Points[b]!,
            candidates[j]!.Points[b + 1]!,
          );
          if (old === 0 && next > 0) return false;
          const oldContact = new Segment(
            edge.Points[a]!,
            edge.Points[a + 1]!,
          ).Intersects(new Segment(other.Points[b]!, other.Points[b + 1]!));
          const newContact = new Segment(
            candidates[i]!.Points[a]!,
            candidates[i]!.Points[a + 1]!,
          ).Intersects(
            new Segment(
              candidates[j]!.Points[b]!,
              candidates[j]!.Points[b + 1]!,
            ),
          );
          if (!oldContact && newContact) return false;
        }
      if (afterCrossings > beforeCrossings) return false;
    }
  return true;
}
