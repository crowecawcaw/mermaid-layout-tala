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
    const locked = [...walls, ...edgeSegments(special, moveX)];
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
          let index = 0;
          for (let i = 0; i < batch.length;) {
            const old = coordinate(batch[i]!.start, moveX);
            const next = narrow.range.floor + ++index * increment;
            while (i < batch.length
              && Math.abs(coordinate(batch[i]!.start, moveX) - old) <= 1) {
              setCoordinate(batch[i]!.start, moveX, next);
              setCoordinate(batch[i]!.end, moveX, next);
              i++;
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
