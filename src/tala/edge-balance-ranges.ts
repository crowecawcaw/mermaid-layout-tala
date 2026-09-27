import type { Point, PositionedEdge, PositionedNode } from '../layout.js';

interface Segment { start: Point; end: Point; edge?: PositionedEdge }
interface Range { floor: number; ceil: number }

/** The range and distribution core of Go's BalanceEdgeSegments. A segment is
 * moved only inside the corridor bounded by node walls and earlier routes. */
export function balanceRouteRanges(nodes: readonly PositionedNode[],
  inputEdges: readonly PositionedEdge[]): PositionedEdge[] {
  const edges = inputEdges.map((edge) => ({ ...edge,
    points: edge.points.map((point) => ({ ...point })) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const special = edges.filter((edge) => {
    if (edge.points.length < 2 || edge.from === edge.to
      || edge.fromTableColumnIndex !== undefined
      || edge.toTableColumnIndex !== undefined) return true;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (from?.shape?.toLowerCase() === 'diamond'
      || to?.shape?.toLowerCase() === 'diamond') return true;
    const first = edge.points[0]!, last = edge.points.at(-1)!;
    return Math.abs(first.x - last.x) === 1 || Math.abs(first.y - last.y) === 1;
  });
  const regular = edges.filter((edge) => !special.includes(edge));
  for (const moveX of [true, false]) {
    const walls = nodeWalls(nodes, moveX);
    const segments = edgeSegments(regular, moveX);
    const specialSegments = edgeSegments(special, moveX);
    const locked = [...walls, ...specialSegments];
    const done = new Set<Segment>();
    while (done.size < segments.length) {
      const ranges = new Map<string, { range: Range; segments: Segment[] }>();
      let shortest = Infinity;
      for (const segment of segments) {
        if (done.has(segment)) continue;
        let [floor, ceil] = segmentBounds(segment, locked, moveX);
        const position = coordinate(segment.start, moveX);
        if (floor === -Infinity) floor = position - 100;
        if (ceil === Infinity) ceil = position + 100;
        const range = { floor, ceil };
        const key = `${floor},${ceil}`;
        let item = ranges.get(key);
        if (!item) ranges.set(key, item = { range, segments: [] });
        item.segments.push(segment);
        shortest = Math.min(shortest, ceil - floor);
      }
      const narrow = [...ranges.values()].find((item) =>
        item.range.ceil - item.range.floor === shortest);
      if (!narrow) break;
      for (const segment of narrow.segments) {
        if (done.has(segment)) continue;
        const batch = narrow.segments.filter((other) => !done.has(other)
          && (other === segment || overlaps(segment, other, moveX,
            segment.edge === other.edge ? 0 : 40)));
        for (const other of segments) {
          if (done.has(other) || batch.includes(other)) continue;
          if (overlaps(segment, other, moveX, 1)
            && Math.abs(coordinate(segment.start, moveX)
              - coordinate(other.start, moveX)) <= 1) batch.push(other);
        }
        batch.sort((a, b) => coordinate(a.start, moveX) - coordinate(b.start, moveX)
          || coordinate(a.start, !moveX) - coordinate(b.start, !moveX));
        const distinct = [...new Set(batch.map((item) =>
          Math.round(coordinate(item.start, moveX))))];
        const increment = Math.floor((narrow.range.ceil - narrow.range.floor)
          / (distinct.length + 1));
        if (increment > 0) {
          const proposed = batch.map((item) => coordinate(item.start, moveX));
          let index = 0;
          for (let i = 0; i < batch.length;) {
            const old = coordinate(batch[i]!.start, moveX);
            const next = narrow.range.floor + ++index * increment;
            while (i < batch.length
              && Math.abs(coordinate(batch[i]!.start, moveX) - old) <= 1) {
              proposed[i] = next;
              i++;
            }
          }
          const batchSet = new Set(batch);
          const ordinaryOrder = balanceOrder(batch, batchSet, segments, proposed, moveX);
          const specialOrder = balanceOrder(batch, batchSet, specialSegments, proposed, moveX);
          const order = ordinaryOrder === 'contact' || specialOrder === 'contact'
            ? 'contact' : ordinaryOrder === 'reversed' || specialOrder === 'reversed'
              ? 'reversed' : 'preserved';
          if (order === 'preserved' || order === 'reversed'
            && reversalRemovesCrossings(edges, batch, proposed, moveX)) {
            for (let i = 0; i < batch.length; i++) {
              setCoordinate(batch[i]!.start, moveX, proposed[i]!);
              setCoordinate(batch[i]!.end, moveX, proposed[i]!);
            }
          }
        }
        for (const item of batch) { done.add(item); locked.push(item); }
      }
    }
  }
  return edges.map((edge) => ({ ...edge, points: edge.points.filter((point, index) =>
    index === 0 || point.x !== edge.points[index - 1]!.x
      || point.y !== edge.points[index - 1]!.y) }));
}

function balanceOrder(batch: readonly Segment[], batchSet: ReadonlySet<Segment>,
  others: readonly Segment[], proposed: readonly number[], moveX: boolean):
  'preserved' | 'reversed' | 'contact' {
  let status: 'preserved' | 'reversed' = 'preserved';
  for (const other of others) {
    if (batchSet.has(other)) continue;
    for (let i = 0; i < batch.length; i++) {
      const segment = batch[i]!;
      if (segment.edge === other.edge) continue;
      const old = coordinate(segment.start, moveX);
      const next = proposed[i]!;
      if (next === old) continue;
      const position = coordinate(other.start, moveX);
      const start = coordinate(segment.start, !moveX);
      const end = coordinate(segment.end, !moveX);
      const otherStart = coordinate(other.start, !moveX);
      const otherEnd = coordinate(other.end, !moveX);
      if (Math.max(start, end) < Math.min(otherStart, otherEnd)
        || Math.max(otherStart, otherEnd) < Math.min(start, end)) continue;
      if (old === position || next === position) return 'contact';
      if ((old < position) !== (next < position)) status = 'reversed';
    }
  }
  return status;
}

function reversalRemovesCrossings(edges: readonly PositionedEdge[],
  batch: readonly Segment[], proposed: readonly number[], moveX: boolean): boolean {
  const moved = new Map<Point, Point>();
  for (let i = 0; i < batch.length; i++) {
    for (const point of [batch[i]!.start, batch[i]!.end]) {
      const replacement = { ...point };
      setCoordinate(replacement, moveX, proposed[i]!);
      const earlier = moved.get(point);
      if (earlier && (earlier.x !== replacement.x || earlier.y !== replacement.y)) return false;
      moved.set(point, replacement);
    }
  }
  const candidate = edges.map((edge) => ({ ...edge,
    points: edge.points.map((point) => moved.get(point) ?? point) }));
  const affected = edges.map((_edge, index) => index).filter((index) =>
    edges[index]!.points.some((point, i) => candidate[index]!.points[i]!.x !== point.x
      || candidate[index]!.points[i]!.y !== point.y));
  for (const i of affected) {
    const points = candidate[i]!.points;
    for (let a = 0; a + 1 < points.length; a++) {
      const first = points[a]!, second = points[a + 1]!;
      if (first.x !== second.x && first.y !== second.y) return false;
    }
  }
  let improved = false;
  const visited = new Set<string>();
  for (const i of affected) for (let j = 0; j < edges.length; j++) {
    if (i === j) continue;
    const key = `${Math.min(i, j)},${Math.max(i, j)}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const before = edgePairCrossings(edges[i]!, edges[j]!);
    const after = edgePairCrossings(candidate[i]!, candidate[j]!);
    if (after > before) return false;
    if (after < before) improved = true;
    for (let a = 0; a + 1 < edges[i]!.points.length; a++) {
      for (let b = 0; b + 1 < edges[j]!.points.length; b++) {
        const original = collinearOverlap(edges[i]!.points[a]!, edges[i]!.points[a + 1]!,
          edges[j]!.points[b]!, edges[j]!.points[b + 1]!);
        const next = collinearOverlap(candidate[i]!.points[a]!, candidate[i]!.points[a + 1]!,
          candidate[j]!.points[b]!, candidate[j]!.points[b + 1]!);
        if (original === 0 && next > 0) return false;
      }
    }
  }
  return improved;
}

function edgePairCrossings(first: PositionedEdge, second: PositionedEdge): number {
  let result = 0;
  for (let i = 0; i + 1 < first.points.length; i++) for (let j = 0;
    j + 1 < second.points.length; j++) {
    const a = first.points[i]!, b = first.points[i + 1]!;
    const c = second.points[j]!, d = second.points[j + 1]!;
    if (a.x === b.x && c.y === d.y && a.x !== c.x && a.x !== d.x
      && c.y !== a.y && c.y !== b.y
      && Math.min(a.y, b.y) < c.y && c.y < Math.max(a.y, b.y)
      && Math.min(c.x, d.x) < a.x && a.x < Math.max(c.x, d.x)) result++;
    if (a.y === b.y && c.x === d.x && a.y !== c.y && a.y !== d.y
      && c.x !== a.x && c.x !== b.x
      && Math.min(a.x, b.x) < c.x && c.x < Math.max(a.x, b.x)
      && Math.min(c.y, d.y) < a.y && a.y < Math.max(c.y, d.y)) result++;
  }
  return result;
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

function coordinate(point: Point, moveX: boolean): number {
  return moveX ? point.x : point.y;
}
function setCoordinate(point: Point, moveX: boolean, value: number): void {
  if (moveX) point.x = value;
  else point.y = value;
}
function nodeWalls(nodes: readonly PositionedNode[], moveX: boolean): Segment[] {
  return nodes.flatMap((node) => {
    const left = node.x - node.width / 2, right = left + node.width;
    const top = node.y - node.height / 2, bottom = top + node.height;
    return moveX ? [
      { start: { x: left, y: top }, end: { x: left, y: bottom } },
      { start: { x: right, y: top }, end: { x: right, y: bottom } },
    ] : [
      { start: { x: left, y: top }, end: { x: right, y: top } },
      { start: { x: left, y: bottom }, end: { x: right, y: bottom } },
    ];
  });
}
function edgeSegments(edges: readonly PositionedEdge[], moveX: boolean): Segment[] {
  const result: Segment[] = [];
  for (const edge of edges) for (let i = 0; i + 1 < edge.points.length; i++) {
    const a = edge.points[i]!, b = edge.points[i + 1]!;
    if (moveX ? a.x !== b.x : a.y !== b.y) continue;
    const ordered = (moveX ? a.y < b.y : a.x < b.x) ? [a, b] : [b, a];
    result.push({ start: ordered[0]!, end: ordered[1]!, edge });
  }
  return result;
}
function segmentBounds(segment: Segment, walls: readonly Segment[],
  moveX: boolean): [number, number] {
  let floor = -Infinity, ceil = Infinity;
  const start = coordinate(segment.start, moveX);
  const low = coordinate(segment.start, !moveX);
  const high = coordinate(segment.end, !moveX);
  if (low === high) return [floor, ceil];
  for (const wall of walls) {
    if (coordinate(wall.end, !moveX) < low - 40
      || coordinate(wall.start, !moveX) > high + 40) continue;
    const position = coordinate(wall.start, moveX);
    if (position <= start) floor = Math.max(floor, position);
    else ceil = Math.min(ceil, position);
  }
  return [floor, ceil];
}
function overlaps(a: Segment, b: Segment, moveX: boolean, buffer: number): boolean {
  return coordinate(a.start, !moveX) - coordinate(b.end, !moveX) < buffer
    && coordinate(b.start, !moveX) - coordinate(a.end, !moveX) < buffer;
}
