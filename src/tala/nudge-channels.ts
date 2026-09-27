import type { Point, PositionedEdge, PositionedNode } from '../layout.js';
import { countEdgeCrossings, countNonSharedCrossings } from './crossings.js';

const spacing = 40;
const epsilon = 1e-6;

interface Segment { start: Point; end: Point; edge?: PositionedEdge }
interface Group { segments: Segment[]; position: number; lower: number; upper: number;
  fixed: boolean; clearance?: [number, number] }
interface Arc { from: number; to: number; separate: boolean }
interface Problem { groups: Group[]; arcs: Arc[] }

/** Port of Go's bounded NudgeEdgeChannels postpass. */
export function nudgeEdgeChannels(nodes: readonly PositionedNode[], input: readonly PositionedEdge[]): PositionedEdge[] {
  const edges = input.map((edge) => ({ ...edge, points: edge.points.map((point) => ({ ...point })) }));
  if (nodes.length > 256 || edges.length > 256
    || edges.reduce((sum, edge) => sum + edge.points.length, 0) > 256) return edges;
  for (const moveX of [true, false]) {
    const problem = buildProblem(nodes, edges, moveX);
    if (!problem.groups.length) continue;
    const previous = edges.map((edge) => edge.points.map((point) => ({ ...point })));
    const oldLength = wireLength(edges);
    const oldCrossings = countNonSharedCrossings(edges);
    if (!applyProblem(nodes, edges, problem, moveX)) continue;
    if (wireLength(edges) > oldLength + epsilon
      || countNonSharedCrossings(edges) > oldCrossings) {
      for (let i = 0; i < edges.length; i++) edges[i]!.points = previous[i]!;
      continue;
    }
    for (let i = 0; i < edges.length; i++) {
      if (edges[i]!.points.some((point, j) => !same(point, previous[i]![j]!))) {
        edges[i]!.points = edges[i]!.points.filter((point, j, points) =>
          j === 0 || !same(point, points[j - 1]!));
      }
    }
  }
  return edges;
}

function buildProblem(nodes: readonly PositionedNode[], edges: readonly PositionedEdge[], moveX: boolean): Problem {
  const segments = edgeSegments(edges, moveX);
  const locked = new Set<PositionedEdge>();
  const fixedPoints = new Set<Point>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.points.length < 2) continue;
    fixedPoints.add(edge.points[0]!); fixedPoints.add(edge.points.at(-1)!);
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (edge.from === edge.to || edge.fromTableColumnIndex !== undefined
      || edge.toTableColumnIndex !== undefined || from?.shape === 'diamond'
      || to?.shape === 'diamond' || edge.points.some((point, i) => i > 0 &&
        (point.x !== edge.points[i - 1]!.x && point.y !== edge.points[i - 1]!.y
          || same(point, edge.points[i - 1]!)))) locked.add(edge);
  }
  const parent = segments.map((_segment, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; }
    return i;
  };
  for (let i = 0; i < segments.length; i++) for (let j = 0; j < i; j++) {
    if (coord(segments[i]!.start, moveX) === coord(segments[j]!.start, moveX)
      && overlaps(segments[i]!, segments[j]!, moveX, spacing)) parent[root(i)] = root(j);
  }
  const byRoot = new Map<number, Group>(), groups: Group[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    let group = byRoot.get(root(i));
    if (!group) { group = { segments: [], position: coord(s.start, moveX), lower: 0,
      upper: 0, fixed: false }; byRoot.set(root(i), group); groups.push(group); }
    group.segments.push(s);
    group.fixed ||= locked.has(s.edge!) || fixedPoints.has(s.start) || fixedPoints.has(s.end);
    for (const node of nodes) {
      if (node.width !== 1 || node.height !== 1) continue;
      const left = node.x - node.width / 2, top = node.y - node.height / 2;
      for (const point of [s.start, s.end]) if ((point.x === left || point.x === left + 1)
        && (point.y === top || point.y === top + 1)) group.fixed = true;
    }
  }
  const fixed = nodeWalls(nodes, moveX);
  for (const group of groups) {
    if (group.fixed) continue;
    let low = -Infinity, high = Infinity;
    for (const segment of group.segments) {
      const [lower, upper] = bounds(segment, fixed);
      if (lower !== -Infinity) low = Math.max(low, lower + Math.min(group.position - lower, spacing));
      if (upper !== Infinity) high = Math.min(high, upper - Math.min(upper - group.position, spacing));
    }
    group.clearance = [low, high];
  }
  const appendFixed = (group: Group) => fixed.push(...group.segments);
  for (const group of groups) if (group.fixed) appendFixed(group);
  for (let pass = 0; pass < 2; pass++) for (const group of groups) {
    if (group.fixed) continue;
    group.lower = -Infinity; group.upper = Infinity;
    for (const segment of group.segments) {
      const [lower, upper] = bounds(segment, fixed);
      group.lower = Math.max(group.lower, lower); group.upper = Math.min(group.upper, upper);
    }
    if (!Number.isFinite(group.lower) || !Number.isFinite(group.upper)
      || group.lower > group.position || group.upper < group.position
      || group.lower >= group.upper) { group.fixed = true; appendFixed(group); }
  }
  const movable = groups.filter((group) => !group.fixed).sort((a, b) => a.position - b.position);
  const arcs: Arc[] = [];
  for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
    const a = movable[i]!, b = movable[j]!;
    const owner = a.segments[0]!.edge;
    const sameOwner = [...a.segments, ...b.segments].every((segment) => segment.edge === owner);
    if (a.segments.some((s) => b.segments.some((t) => overlaps(s, t, moveX,
      sameOwner ? 0 : spacing)))) arcs.push({ from: i, to: j, separate: !sameOwner });
  }
  return { groups: movable, arcs };
}

function applyProblem(nodes: readonly PositionedNode[], edges: PositionedEdge[],
  problem: Problem, moveX: boolean): boolean {
  const parent = problem.groups.map((_group, i) => i);
  const root = (i: number): number => { while (parent[i] !== i) {
    parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
  for (const arc of problem.arcs) parent[root(arc.to)] = root(arc.from);
  const components = new Map<number, number[]>();
  for (let i = 0; i < problem.groups.length; i++) {
    const id = root(i); const member = components.get(id) ?? [];
    member.push(i); components.set(id, member);
  }
  let changed = false;
  for (const indices of components.values()) {
    const mapping = new Map(indices.map((index, i) => [index, i]));
    const local: Problem = { groups: indices.map((index) => problem.groups[index]!),
      arcs: problem.arcs.filter((arc) => mapping.has(arc.from)).map((arc) => ({
        from: mapping.get(arc.from)!, to: mapping.get(arc.to)!, separate: arc.separate })) };
    const positions = local.groups.map((group) => group.position);
    const oldGap = Math.max(0, channelGap(local, positions));
    let left = oldGap, right = Math.min(...local.groups.map((group) =>
      (group.upper - group.lower) / 2));
    for (let iteration = 0; iteration < 32 && right - left > epsilon; iteration++) {
      const mid = (left + right) / 2;
      if (solveGap(local, mid)) left = mid; else right = mid;
    }
    let bestLength = wireLength(edges), bestGap = oldGap;
    let best: Map<Point, Point> | undefined;
    for (const gap of [oldGap, left]) {
      const solved = solveGap(local, gap);
      if (!solved) continue;
      for (const fraction of [0, 1, 0.5]) {
        const candidate = solved.lo.map((lo, i) => lo * (1 - fraction) + solved.hi[i]! * fraction);
        const proposal = pointProposal(local, candidate, moveX);
        if (!proposal) continue;
        const length = wireLength(edges, proposal), actualGap = channelGap(local, candidate);
        if (length > bestLength + epsilon || Math.abs(length - bestLength) <= epsilon
          && actualGap < bestGap + 1) continue;
        if (!proposalSafe(nodes, edges, proposal)) continue;
        best = proposal; bestLength = length; bestGap = actualGap;
      }
    }
    if (best) { for (const [point, candidate] of best) { point.x = candidate.x; point.y = candidate.y; }
      changed = true; }
  }
  return changed;
}

function solveGap(problem: Problem, gap: number): { lo: number[]; hi: number[] } | undefined {
  const lo = problem.groups.map((group) => Math.max(group.lower + gap,
    group.clearance?.[0] ?? -Infinity));
  const hi = problem.groups.map((group) => Math.min(group.upper - gap,
    group.clearance?.[1] ?? Infinity));
  for (const arc of problem.arcs) lo[arc.to] = Math.max(lo[arc.to]!, lo[arc.from]!
    + (arc.separate ? gap : 0));
  for (let i = problem.arcs.length - 1; i >= 0; i--) {
    const arc = problem.arcs[i]!;
    hi[arc.from] = Math.min(hi[arc.from]!, hi[arc.to]! - (arc.separate ? gap : 0));
  }
  return lo.every((value, i) => value <= hi[i]!) ? { lo, hi } : undefined;
}
function channelGap(problem: Problem, positions: number[]): number {
  let gap = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const group = problem.groups[i]!;
    gap = Math.min(gap, positions[i]! - group.lower, group.upper - positions[i]!);
  }
  for (const arc of problem.arcs) if (arc.separate) gap = Math.min(gap,
    positions[arc.to]! - positions[arc.from]!);
  return gap;
}
function pointProposal(problem: Problem, positions: number[], moveX: boolean): Map<Point, Point> | undefined {
  const proposal = new Map<Point, Point>();
  for (let i = 0; i < problem.groups.length; i++) for (const segment of problem.groups[i]!.segments)
    for (const point of [segment.start, segment.end]) {
      const candidate = { ...point, [moveX ? 'x' : 'y']: positions[i]! };
      if (proposal.has(point) && !same(proposal.get(point)!, candidate)) return undefined;
      proposal.set(point, candidate);
    }
  return proposal;
}
function wireLength(edges: readonly PositionedEdge[], proposal?: Map<Point, Point>): number {
  let length = 0;
  for (const edge of edges) for (let i = 1; i < edge.points.length; i++) {
    const a = proposal?.get(edge.points[i - 1]!) ?? edge.points[i - 1]!;
    const b = proposal?.get(edge.points[i]!) ?? edge.points[i]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}
function proposalSafe(nodes: readonly PositionedNode[], edges: readonly PositionedEdge[],
  proposal: Map<Point, Point>): boolean {
  const candidates = edges.map((edge) => ({ ...edge,
    points: edge.points.map((point) => proposal.get(point) ?? point) }));
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index]!, candidate = candidates[index]!;
    if (edge.points.every((point, i) => same(point, candidate.points[i]!))) continue;
    if (!same(edge.points[0]!, candidate.points[0]!)
      || !same(edge.points.at(-1)!, candidate.points.at(-1)!)) return false;
    let beforeLength = 0, afterLength = 0;
    const nonzero: Point[] = [];
    for (let i = 0; i < candidate.points.length; i++) {
      const point = candidate.points[i]!;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      if (i > 0) {
        const old = edge.points[i]!, prevOld = edge.points[i - 1]!;
        const prev = candidate.points[i - 1]!;
        const before = Math.hypot(old.x - prevOld.x, old.y - prevOld.y);
        const after = Math.hypot(point.x - prev.x, point.y - prev.y);
        beforeLength += before; afterLength += after;
        if (after > epsilon && after + epsilon < Math.min(before, spacing)) return false;
        if (point.x !== prev.x && point.y !== prev.y) return false;
        if (!segmentClear(nodes, edge, prev, point)) return false;
      }
      if (!nonzero.length || !same(nonzero.at(-1)!, point)) nonzero.push(point);
    }
    if (afterLength > beforeLength + epsilon) return false;
    for (let i = 2; i < nonzero.length; i++) {
      const a = nonzero[i - 2]!, b = nonzero[i - 1]!, c = nonzero[i]!;
      if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false;
    }
    for (let i = 0; i + 1 < nonzero.length; i++) for (let j = i + 2;
      j + 1 < nonzero.length; j++) if (segmentsIntersect(nonzero[i]!,
        nonzero[i + 1]!, nonzero[j]!, nonzero[j + 1]!)) return false;
  }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    if (edges[i]!.points.every((point, index) => same(point, candidates[i]!.points[index]!))
      && edges[j]!.points.every((point, index) => same(point, candidates[j]!.points[index]!))) continue;
    if (countEdgeCrossings(candidates[i]!, candidates[j]!)
      > countEdgeCrossings(edges[i]!, edges[j]!)) return false;
    for (let a = 0; a + 1 < edges[i]!.points.length; a++) for (let b = 0;
      b + 1 < edges[j]!.points.length; b++) {
      const oldA = edges[i]!.points[a]!, oldB = edges[i]!.points[a + 1]!;
      const oldC = edges[j]!.points[b]!, oldD = edges[j]!.points[b + 1]!;
      const nextA = candidates[i]!.points[a]!, nextB = candidates[i]!.points[a + 1]!;
      const nextC = candidates[j]!.points[b]!, nextD = candidates[j]!.points[b + 1]!;
      if (collinearOverlap(oldA, oldB, oldC, oldD) === 0
        && collinearOverlap(nextA, nextB, nextC, nextD) > 0) return false;
      if (!segmentsIntersect(oldA, oldB, oldC, oldD)
        && segmentsIntersect(nextA, nextB, nextC, nextD)) return false;
    }
  }
  return true;
}
function collinearOverlap(a: Point, b: Point, c: Point, d: Point): number {
  if (a.x === b.x && c.x === d.x && a.x === c.x) return Math.max(0,
    Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
      - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
  if (a.y === b.y && c.y === d.y && a.y === c.y) return Math.max(0,
    Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
  return 0;
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const orientation = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x)
    && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC === 0 && on(a, b, c) || abD === 0 && on(a, b, d)
    || cdA === 0 && on(c, d, a) || cdB === 0 && on(c, d, b)) return true;
  return (abC < 0) !== (abD < 0) && (cdA < 0) !== (cdB < 0);
}
function segmentClear(nodes: readonly PositionedNode[], edge: PositionedEdge, a: Point, b: Point): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const isAncestor = (ancestor: string, member: string): boolean => {
    for (let parent = byId.get(member)?.parentId; parent; parent = byId.get(parent)?.parentId)
      if (parent === ancestor) return true;
    return false;
  };
  for (const node of nodes) {
    if (node.id !== edge.from && node.id !== edge.to
      && (isAncestor(node.id, edge.from) || isAncestor(node.id, edge.to))) continue;
    const left = node.x - node.width / 2, right = left + node.width;
    const top = node.y - node.height / 2, bottom = top + node.height;
    if (a.x === b.x && a.x > left + epsilon && a.x < right - epsilon
      && Math.max(a.y, b.y) > top + epsilon
      && Math.min(a.y, b.y) < bottom - epsilon) return false;
    if (a.y === b.y && a.y > top + epsilon && a.y < bottom - epsilon
      && Math.max(a.x, b.x) > left + epsilon
      && Math.min(a.x, b.x) < right - epsilon) return false;
  }
  return true;
}
function edgeSegments(edges: readonly PositionedEdge[], moveX: boolean): Segment[] {
  const result: Segment[] = [];
  for (const edge of edges) for (let i = 0; i + 1 < edge.points.length; i++) {
    const a = edge.points[i]!, b = edge.points[i + 1]!;
    if (coord(a, moveX) !== coord(b, moveX)) continue;
    result.push(coord(a, !moveX) < coord(b, !moveX)
      ? { start: a, end: b, edge } : { start: b, end: a, edge });
  }
  return result;
}
function nodeWalls(nodes: readonly PositionedNode[], moveX: boolean): Segment[] {
  return nodes.flatMap((node) => {
    const left = node.x - node.width / 2, right = left + node.width;
    const top = node.y - node.height / 2, bottom = top + node.height;
    return moveX ? [{ start: { x: left, y: top }, end: { x: left, y: bottom } },
      { start: { x: right, y: top }, end: { x: right, y: bottom } }]
      : [{ start: { x: left, y: top }, end: { x: right, y: top } },
        { start: { x: left, y: bottom }, end: { x: right, y: bottom } }];
  });
}
function bounds(segment: Segment, walls: readonly Segment[]): [number, number] {
  let lower = -Infinity, upper = Infinity;
  if (same(segment.start, segment.end)) return [lower, upper];
  const moveX = segment.start.x === segment.end.x;
  for (const wall of walls) {
    if (coord(wall.end, !moveX) < coord(segment.start, !moveX) - spacing
      || coord(wall.start, !moveX) > coord(segment.end, !moveX) + spacing) continue;
    const position = coord(wall.start, moveX);
    if (position <= coord(segment.start, moveX)) lower = Math.max(lower, position);
    else upper = Math.min(upper, position);
  }
  return [lower, upper];
}
function overlaps(a: Segment, b: Segment, moveX: boolean, buffer: number): boolean {
  return coord(a.start, !moveX) - coord(b.end, !moveX) < buffer
    && coord(b.start, !moveX) - coord(a.end, !moveX) < buffer;
}
function coord(point: Point, x: boolean): number { return x ? point.x : point.y; }
function same(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }
