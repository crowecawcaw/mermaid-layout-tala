// Translated from internal/routing/nudge_channels.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Point } from '../geo/point.js';
import type { BalancedEdgeSegment } from './balance-geometry.js';
import type { RouteWorkGuard } from './stage-guard.js';
export const channelEpsilon = 1e-6;
export interface ChannelGroup {
  segments: BalancedEdgeSegment[];
  position: number;
  lower: number;
  upper: number;
  fixed: boolean;
  nodeClearance: { start: number; end: number } | null;
}
export interface ChannelArc {
  from: number;
  to: number;
  separate: boolean;
}
export interface ChannelProblem {
  groups: ChannelGroup[];
  arcs: ChannelArc[];
}
export function solveChannelGap(
  p: ChannelProblem,
  gap: number,
  guard: RouteWorkGuard,
): [number[], number[], boolean] {
  const n = p.groups.length;
  guard.Add(BigInt(n) * 2n);
  const lo: number[] = [],
    hi: number[] = [];
  for (const group of p.groups) {
    let lower = group.lower + gap,
      upper = group.upper - gap;
    if (group.nodeClearance) {
      lower = Math.max(lower, group.nodeClearance.start);
      upper = Math.min(upper, group.nodeClearance.end);
    }
    lo.push(lower);
    hi.push(upper);
  }
  for (const arc of p.arcs) {
    guard.Step();
    const separation = arc.separate ? gap : 0;
    lo[arc.to] = Math.max(lo[arc.to]!, lo[arc.from]! + separation);
  }
  for (let i = p.arcs.length - 1; i >= 0; i--) {
    const arc = p.arcs[i]!;
    guard.Step();
    const separation = arc.separate ? gap : 0;
    hi[arc.from] = Math.min(hi[arc.from]!, hi[arc.to]! - separation);
  }
  for (let i = 0; i < lo.length; i++)
    if (lo[i]! > hi[i]!) return [[], [], false];
  return [lo, hi, true];
}
export function channelGap(p: ChannelProblem, positions: number[]): number {
  let gap = Infinity;
  for (let i = 0; i < p.groups.length; i++) {
    const group = p.groups[i]!;
    gap = Math.min(
      gap,
      Math.min(positions[i]! - group.lower, group.upper - positions[i]!),
    );
  }
  for (const arc of p.arcs)
    if (arc.separate)
      gap = Math.min(gap, positions[arc.to]! - positions[arc.from]!);
  return gap;
}
export function channelPointProposal(
  p: ChannelProblem,
  positions: number[],
  horizontal: boolean,
  guard: RouteWorkGuard,
): [Map<Point, Point>, boolean] {
  const proposal = new Map<Point, Point>();
  for (let i = 0; i < p.groups.length; i++)
    for (const segment of p.groups[i]!.segments)
      for (const point of [segment.Start, segment.End]) {
        guard.Step();
        const candidate = point.Copy();
        if (horizontal) candidate.X = positions[i]!;
        else candidate.Y = positions[i]!;
        const old = proposal.get(point);
        if (old && !old.Equals(candidate)) return [new Map(), false];
        proposal.set(point, candidate);
      }
  return [proposal, true];
}
export function channelWireLength(
  g: Graph,
  proposal: Map<Point, Point> | null,
  guard: RouteWorkGuard,
): number {
  let length = 0;
  for (const edge of g.Edges)
    for (let i = 1; i < edge.Points.length; i++) {
      guard.Step();
      let a = edge.Points[i - 1]!,
        b = edge.Points[i]!;
      a = proposal?.get(a) ?? a;
      b = proposal?.get(b) ?? b;
      length += Math.hypot(b.X - a.X, b.Y - a.Y);
    }
  return length;
}
