// Translated from internal/routing/nudge_channels.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Point } from '../geo/point.js';
import type { Segment } from '../geo/segment.js';
import { Inspect } from '../quality/inspection.js';
import {
  edgeSegmentsGuarded,
  nodeSegmentsGuarded,
  routeSegmentBounds,
  removeDuplicatePointsGuarded,
} from './balance-geometry.js';
import {
  isSpecialEdgeForBalancing,
  hasFixedBalancingPorts,
  copyRoutePoints,
} from './balance-segments.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  stableSortRouteValues,
  captureRouteMutations,
  runAtomicRouteStage,
} from './stage-guard.js';
import {
  channelEpsilon,
  type ChannelProblem,
  type ChannelGroup,
  solveChannelGap,
  channelGap,
  channelPointProposal,
  channelWireLength,
} from './channel-constraints.js';
import { channelProposalSafe } from './channel-safety.js';

const maxChannelSegments = 256,
  segmentSpacingBuffer = 40;
export function channelInputTooLarge(g: Graph | null): boolean {
  if (!g) return false;
  if (
    g.Nodes.length > maxChannelSegments ||
    g.Edges.length > maxChannelSegments
  )
    return true;
  let remaining = maxChannelSegments;
  for (const edge of g.Edges) {
    if (!edge) continue;
    if (edge.Points.length > remaining) return true;
    remaining -= edge.Points.length;
  }
  return false;
}
export function buildChannelProblem(
  g: Graph,
  horizontal: boolean,
  guard: RouteWorkGuard,
): ChannelProblem {
  const result: ChannelProblem = { groups: [], arcs: [] },
    segments = edgeSegmentsGuarded(g.Edges, !horizontal, guard),
    fixedPoints = new Set<Point>();
  for (const node of g.Nodes) fixedPoints.add(node.TopLeft!);
  const lockedEdges = new Set<Edge>();
  for (const e of g.Edges) {
    guard.Step();
    if (e.Points.length < 2) continue;
    fixedPoints.add(e.Points[0]!);
    fixedPoints.add(e.Points.at(-1)!);
    if (
      e.IsCurve ||
      e.IsLoop() ||
      g.NodeToTree.has(e.From) ||
      g.NodeToTree.has(e.To) ||
      (isSpecialEdgeForBalancing(g, e) && !hasFixedBalancingPorts(e))
    )
      lockedEdges.add(e);
    for (let i = 1; i < e.Points.length; i++) {
      guard.Step();
      const a = e.Points[i - 1]!,
        b = e.Points[i]!;
      if ((a.X !== b.X && a.Y !== b.Y) || a.Equals(b)) lockedEdges.add(e);
    }
  }
  const coordinate = (p: Point) => (horizontal ? p.X : p.Y),
    parent = segments.map((_, i) => i);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (let i = 0; i < segments.length; i++)
    for (let j = 0; j < i; j++) {
      guard.Step();
      const s = segments[i]!,
        other = segments[j]!;
      if (
        coordinate(s.Start) === coordinate(other.Start) &&
        s.Overlaps(other, horizontal, segmentSpacingBuffer)
      )
        parent[root(i)] = root(j);
    }
  const byRoot = new Map<number, ChannelGroup>(),
    groups: ChannelGroup[] = [];
  for (let i = 0; i < segments.length; i++) {
    guard.Step();
    const s = segments[i]!,
      index = root(i);
    let group = byRoot.get(index);
    if (!group) {
      group = {
        segments: [],
        position: coordinate(s.Start),
        lower: 0,
        upper: 0,
        fixed: false,
        nodeClearance: null,
      };
      byRoot.set(index, group);
      groups.push(group);
    }
    group.segments.push(s);
    group.fixed ||=
      lockedEdges.has(s.owner) ||
      fixedPoints.has(s.Start) ||
      fixedPoints.has(s.End);
    for (const n of g.Nodes) {
      guard.Step();
      if (n.Width !== 1 || n.Height !== 1) continue;
      for (const p of [s.Start, s.End])
        if (
          (p.X === n.TopLeft!.X || p.X === n.TopLeft!.X + 1) &&
          (p.Y === n.TopLeft!.Y || p.Y === n.TopLeft!.Y + 1)
        )
          group.fixed = true;
    }
  }
  const fixed: Segment[] = nodeSegmentsGuarded(g.Nodes, !horizontal, guard),
    nodeWalls = [...fixed];
  for (const group of groups) {
    if (group.fixed) continue;
    const clearance = { start: -Infinity, end: Infinity };
    for (const s of group.segments) {
      const [lower, upper] = routeSegmentBounds(
        s,
        nodeWalls,
        segmentSpacingBuffer,
        guard,
      );
      if (lower !== -Infinity)
        clearance.start = Math.max(
          clearance.start,
          lower + Math.min(group.position - lower, segmentSpacingBuffer),
        );
      if (upper !== Infinity)
        clearance.end = Math.min(
          clearance.end,
          upper - Math.min(upper - group.position, segmentSpacingBuffer),
        );
    }
    group.nodeClearance = clearance;
  }
  const appendFixed = (group: ChannelGroup) => {
    for (const s of group.segments) fixed.push(s);
  };
  for (const group of groups) if (group.fixed) appendFixed(group);
  for (let pass = 0; pass < 2; pass++)
    for (const group of groups) {
      if (group.fixed) continue;
      group.lower = -Infinity;
      group.upper = Infinity;
      for (const s of group.segments) {
        const [lo, hi] = routeSegmentBounds(
          s,
          fixed,
          segmentSpacingBuffer,
          guard,
        );
        group.lower = Math.max(group.lower, lo);
        group.upper = Math.min(group.upper, hi);
      }
      if (
        !Number.isFinite(group.lower) ||
        !Number.isFinite(group.upper) ||
        group.lower > group.position ||
        group.upper < group.position ||
        group.lower >= group.upper
      ) {
        group.fixed = true;
        appendFixed(group);
      }
    }
  for (const group of groups) if (!group.fixed) result.groups.push(group);
  stableSortRouteValues(
    result.groups,
    (a, b) => a.position < b.position,
    guard,
  );
  for (let i = 0; i < result.groups.length; i++)
    for (let j = i + 1; j < result.groups.length; j++) {
      const a = result.groups[i]!,
        b = result.groups[j]!,
        owner = a.segments[0]!.owner;
      let linked = false,
        sameOwner = true;
      for (const s of a.segments) sameOwner &&= s.owner === owner;
      for (const s of b.segments) sameOwner &&= s.owner === owner;
      const buffer = sameOwner ? 0 : segmentSpacingBuffer;
      for (const s of a.segments)
        for (const t of b.segments) {
          guard.Step();
          linked ||= s.Overlaps(t, horizontal, buffer);
        }
      if (linked) result.arcs.push({ from: i, to: j, separate: !sameOwner });
    }
  return result;
}
export function applyChannelProblem(
  g: Graph,
  p: ChannelProblem,
  horizontal: boolean,
  guard: RouteWorkGuard,
): boolean {
  const parent = p.groups.map((_, i) => i);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (const arc of p.arcs) parent[root(arc.to)] = root(arc.from);
  const components = new Map<number, number[]>();
  for (let i = 0; i < p.groups.length; i++) {
    const id = root(i);
    let group = components.get(id);
    if (!group) {
      group = [];
      components.set(id, group);
    }
    group.push(i);
  }
  let changed = false;
  for (const members of components.values()) {
    const local: ChannelProblem = { groups: [], arcs: [] },
      indices = new Map<number, number>();
    for (const i of members) {
      indices.set(i, local.groups.length);
      local.groups.push(p.groups[i]!);
    }
    for (const arc of p.arcs) {
      const from = indices.get(arc.from);
      if (from !== undefined)
        local.arcs.push({
          from,
          to: indices.get(arc.to)!,
          separate: arc.separate,
        });
    }
    const positions = local.groups.map((group) => group.position),
      oldGap = Math.max(0, channelGap(local, positions));
    let left = oldGap,
      right = Infinity;
    for (const group of local.groups)
      right = Math.min(right, (group.upper - group.lower) / 2);
    for (
      let iteration = 0;
      iteration < 32 && right - left > channelEpsilon;
      iteration++
    ) {
      const mid = (left + right) / 2,
        [, , feasible] = solveChannelGap(local, mid, guard);
      if (feasible) left = mid;
      else right = mid;
    }
    let bestLength = channelWireLength(g, null, guard),
      bestGap = oldGap,
      best: Map<Point, Point> | null = null;
    for (const gap of [oldGap, left]) {
      const [earliest, latest, feasible] = solveChannelGap(local, gap, guard);
      if (!feasible) continue;
      for (const fraction of [0, 1, 0.5]) {
        const candidate = positions.map(
            (_, i) => earliest[i]! * (1 - fraction) + latest[i]! * fraction,
          ),
          [proposal, compatible] = channelPointProposal(
            local,
            candidate,
            horizontal,
            guard,
          );
        if (!compatible) continue;
        const length = channelWireLength(g, proposal, guard),
          actualGap = channelGap(local, candidate);
        if (
          length > bestLength + channelEpsilon ||
          (Math.abs(length - bestLength) <= channelEpsilon &&
            actualGap < bestGap + 1)
        )
          continue;
        if (!channelProposalSafe(g, proposal, guard)) continue;
        best = proposal;
        bestLength = length;
        bestGap = actualGap;
      }
    }
    if (best) {
      for (const [original, candidate] of best) {
        guard.Step();
        original.X = candidate.X;
        original.Y = candidate.Y;
      }
      changed = true;
    }
  }
  return changed;
}
function channelInventoryIsClosed(
  g: Graph,
  snapshot: ReturnType<typeof captureRouteMutations>,
  guard: RouteWorkGuard,
): boolean {
  const nodes = new Set(g.Nodes),
    edges = new Set(g.Edges);
  for (const n of g.Nodes) {
    guard.Step();
    nodes.add(n);
  }
  for (const e of g.Edges) {
    guard.Step();
    edges.add(e);
  }
  for (const n of snapshot.nodes.keys()) {
    guard.Step();
    if (!nodes.has(n)) return false;
  }
  for (const e of snapshot.edges.keys()) {
    guard.Step();
    if (!edges.has(e)) return false;
  }
  return true;
}
export function nudgeChannelsWithLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  if (ctx && g) {
    const error = ctx.Err();
    if (error) throw error;
    if (channelInputTooLarge(g)) {
      const err = ctx.Err();
      if (err) throw err;
      return;
    }
  }
  runAtomicRouteStage(ctx, 'NudgeChannels', g, [], limit, (guard) => {
    for (const horizontal of [true, false]) {
      const problem = buildChannelProblem(g, horizontal, guard);
      if (!problem.groups.length) continue;
      const snapshot = captureRouteMutations(g, [], guard);
      if (!channelInventoryIsClosed(g, snapshot, guard)) return;
      const before = copyRoutePoints(g.Edges, guard),
        metrics = Inspect(ctx, g);
      if (!applyChannelProblem(g, problem, horizontal, guard)) continue;
      const after = Inspect(ctx, g);
      if (
        after.RouteObstructions > metrics.RouteObstructions ||
        after.Crossings > metrics.Crossings ||
        after.TextOcclusions > metrics.TextOcclusions ||
        after.RouteLength > metrics.RouteLength + channelEpsilon
      ) {
        snapshot.restore();
        continue;
      }
      for (const edge of g.Edges) {
        let moved = false;
        for (let i = 0; i < edge.Points.length; i++)
          if (!edge.Points[i]!.Equals(before.get(edge)![i]!)) {
            moved = true;
            break;
          }
        if (moved)
          edge.Points = removeDuplicatePointsGuarded(edge.Points, guard);
      }
    }
  });
}
export function NudgeEdgeChannels(ctx: Context, g: Graph): void {
  try {
    nudgeChannelsWithLimit(ctx, g, MaxRouteStageWorkUnits);
  } catch (error) {
    if (
      (error as Error).message.startsWith(
        'TALA route-stage work limit exceeded:',
      )
    )
      return;
    throw error;
  }
}
