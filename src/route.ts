import type { LayoutDirection, LayoutEdge, Point, PositionedEdge, PositionedNode } from './layout.js';

type Side = 'N' | 'S' | 'E' | 'W';
type Axis = 0 | 1 | 2;
interface Rect { left: number; right: number; top: number; bottom: number }
interface Port { point: Point; outer: Point; side: Side }

const CLEARANCE = 12;
const BEND_COST = 24;

/** Orthogonal visibility-grid routing with node and container obstacles. */
export function routeGraphEdges(
  nodes: readonly PositionedNode[],
  edges: readonly LayoutEdge[],
  direction: LayoutDirection,
  canonicalTreePaths: ReadonlyMap<string, Point[]> = new Map()
): PositionedEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parallel = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}`;
    const group = parallel.get(key) ?? [];
    group.push(edge);
    parallel.set(key, group);
  }
  const offsets = new Map<string, number>();
  for (const group of parallel.values()) {
    group.sort((a, b) => compareText(a.id, b.id));
    group.forEach((edge, index) => offsets.set(edge.id, (index - (group.length - 1) / 2) * 10));
  }

  return [...edges].sort((a, b) => compareText(a.id, b.id)).map((edge) => {
    const source = byId.get(edge.from)!;
    const target = byId.get(edge.to)!;
    const offset = offsets.get(edge.id) ?? 0;
    const treePoints = canonicalTreePaths.get(edge.id);
    const points = treePoints ?? (source.id === target.id
      ? selfLoop(source, offset)
      : routeBetween(source, target, nodes, byId, direction, offset));
    const compact = treePoints ? points : normalize(points);
    const middle = chooseLabelPoint(compact, edge, nodes);
    return { ...edge, points: compact, x: middle.x, y: middle.y };
  });
}

function routeBetween(
  source: PositionedNode,
  target: PositionedNode,
  nodes: readonly PositionedNode[],
  byId: Map<string, PositionedNode>,
  direction: LayoutDirection,
  offset: number
): Point[] {
  const traversableAncestors = new Set([source.id, target.id]);
  for (const endpoint of [source, target]) {
    let parentId = endpoint.parentId;
    while (parentId) {
      if (traversableAncestors.has(parentId)) break;
      traversableAncestors.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  const obstacles = nodes
    .filter((node) => !traversableAncestors.has(node.id))
    .map((node) => rect(node, CLEARANCE));
  // A route may touch an endpoint boundary only at its chosen port. Keep both
  // endpoint interiors unavailable to the visibility search.
  obstacles.push(rect(source, CLEARANCE), rect(target, CLEARANCE));
  const pairs = portPairs(source, target, direction);
  let best: { points: Point[]; cost: number } | undefined;
  for (const [startSide, endSide, preference] of pairs) {
    const start = port(source, startSide, offset);
    const end = port(target, endSide, offset);
    if (insideAny(start.outer, obstacles) || insideAny(end.outer, obstacles)) continue;
    const path = searchGrid(start.outer, end.outer, obstacles);
    if (!path) continue;
    const points = [start.point, ...path, end.point];
    const cost = routeCost(points) + preference;
    if (!best || cost < best.cost) best = { points, cost };
  }
  return best?.points ?? fallback(source, target, direction, offset);
}

function portPairs(source: PositionedNode, target: PositionedNode, direction: LayoutDirection): Array<[Side, Side, number]> {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const primary: [Side, Side] = direction === 'TB' ? ['S', 'N']
    : direction === 'BT' ? ['N', 'S']
    : direction === 'LR' ? ['E', 'W'] : ['W', 'E'];
  const naturalX: [Side, Side] = dx >= 0 ? ['E', 'W'] : ['W', 'E'];
  const naturalY: [Side, Side] = dy >= 0 ? ['S', 'N'] : ['N', 'S'];
  const candidates: Array<[Side, Side, number]> = [
    [...primary, 0],
    [...naturalX, Math.abs(dx) >= Math.abs(dy) ? 8 : 28],
    [...naturalY, Math.abs(dy) >= Math.abs(dx) ? 8 : 28],
    [naturalX[0], naturalY[1], 36],
    [naturalY[0], naturalX[1], 36],
  ];
  const seen = new Set<string>();
  return candidates.filter(([a, b]) => {
    const key = a + b;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function port(node: PositionedNode, side: Side, offset: number): Port {
  const xOffset = clamp(offset, -node.width / 2 + 2, node.width / 2 - 2);
  const yOffset = clamp(offset, -node.height / 2 + 2, node.height / 2 - 2);
  const point = side === 'N' ? { x: node.x + xOffset, y: node.y - node.height / 2 }
    : side === 'S' ? { x: node.x + xOffset, y: node.y + node.height / 2 }
    : side === 'E' ? { x: node.x + node.width / 2, y: node.y + yOffset }
    : { x: node.x - node.width / 2, y: node.y + yOffset };
  const outer = side === 'N' ? { x: point.x, y: point.y - CLEARANCE }
    : side === 'S' ? { x: point.x, y: point.y + CLEARANCE }
    : side === 'E' ? { x: point.x + CLEARANCE, y: point.y }
    : { x: point.x - CLEARANCE, y: point.y };
  return { point, outer, side };
}

function searchGrid(start: Point, end: Point, obstacles: readonly Rect[]): Point[] | undefined {
  const xs = uniqueSorted([start.x, end.x, (start.x + end.x) / 2,
    ...obstacles.flatMap((box) => [box.left, box.right]),
    Math.min(start.x, end.x, ...obstacles.map((box) => box.left)) - CLEARANCE,
    Math.max(start.x, end.x, ...obstacles.map((box) => box.right)) + CLEARANCE]);
  const ys = uniqueSorted([start.y, end.y, (start.y + end.y) / 2,
    ...obstacles.flatMap((box) => [box.top, box.bottom]),
    Math.min(start.y, end.y, ...obstacles.map((box) => box.top)) - CLEARANCE,
    Math.max(start.y, end.y, ...obstacles.map((box) => box.bottom)) + CLEARANCE]);
  if (xs.length * ys.length > 30_000) return undefined;
  const columns = xs.length;
  const rows = ys.length;
  const vertex = (x: number, y: number) => y * columns + x;
  const sx = xs.indexOf(start.x), sy = ys.indexOf(start.y);
  const ex = xs.indexOf(end.x), ey = ys.indexOf(end.y);
  const goal = vertex(ex, ey);
  const blocked = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (insideAny({ x: xs[x]!, y: ys[y]! }, obstacles)) blocked[vertex(x, y)] = 1;
  }
  if (blocked[vertex(sx, sy)] || blocked[goal]) return undefined;
  const distances = new Float64Array(columns * rows * 3).fill(Infinity);
  const previous = new Int32Array(distances.length).fill(-1);
  const startState = vertex(sx, sy) * 3;
  distances[startState] = 0;
  const heap = new MinHeap();
  heap.push(startState, 0);
  let terminal = -1;
  while (heap.length) {
    const item = heap.pop()!;
    const state = item.state;
    if (item.cost !== distances[state]) continue;
    const at = Math.floor(state / 3);
    if (at === goal) { terminal = state; break; }
    const axis = (state % 3) as Axis;
    const x = at % columns, y = Math.floor(at / columns);
    for (const [nx, ny, nextAxis] of [[x - 1, y, 1], [x + 1, y, 1], [x, y - 1, 2], [x, y + 1, 2]] as const) {
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const neighbor = vertex(nx, ny);
      if (blocked[neighbor]) continue;
      const a = { x: xs[x]!, y: ys[y]! }, b = { x: xs[nx]!, y: ys[ny]! };
      if (segmentBlocked(a, b, obstacles)) continue;
      const next = neighbor * 3 + nextAxis;
      const candidate = item.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        + (axis !== 0 && axis !== nextAxis ? BEND_COST : 0);
      if (candidate < distances[next]!) {
        distances[next] = candidate;
        previous[next] = state;
        heap.push(next, candidate);
      }
    }
  }
  if (terminal < 0) return undefined;
  const route: Point[] = [];
  for (let state = terminal; state !== -1; state = previous[state]!) {
    const at = Math.floor(state / 3);
    route.push({ x: xs[at % columns]!, y: ys[Math.floor(at / columns)]! });
  }
  return route.reverse();
}

function rect(node: PositionedNode, margin: number): Rect {
  return { left: node.x - node.width / 2 - margin, right: node.x + node.width / 2 + margin,
    top: node.y - node.height / 2 - margin, bottom: node.y + node.height / 2 + margin };
}

function insideAny(point: Point, obstacles: readonly Rect[]): boolean {
  return obstacles.some((box) => point.x > box.left + 1e-7 && point.x < box.right - 1e-7
    && point.y > box.top + 1e-7 && point.y < box.bottom - 1e-7);
}

function segmentBlocked(a: Point, b: Point, obstacles: readonly Rect[]): boolean {
  return obstacles.some((box) => a.y === b.y
    ? a.y > box.top + 1e-7 && a.y < box.bottom - 1e-7
      && Math.max(a.x, b.x) > box.left + 1e-7 && Math.min(a.x, b.x) < box.right - 1e-7
    : a.x > box.left + 1e-7 && a.x < box.right - 1e-7
      && Math.max(a.y, b.y) > box.top + 1e-7 && Math.min(a.y, b.y) < box.bottom - 1e-7);
}

function routeCost(points: readonly Point[]): number {
  let cost = 0;
  for (let i = 1; i < points.length; i++) cost += Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
  for (let i = 2; i < points.length; i++) {
    const horizontalBefore = points[i - 2]!.y === points[i - 1]!.y;
    const horizontalAfter = points[i - 1]!.y === points[i]!.y;
    if (horizontalBefore !== horizontalAfter) cost += BEND_COST;
  }
  return cost;
}

function fallback(source: PositionedNode, target: PositionedNode, direction: LayoutDirection, offset: number): Point[] {
  const vertical = direction === 'TB' || direction === 'BT';
  const start = port(source, vertical ? (target.y >= source.y ? 'S' : 'N') : (target.x >= source.x ? 'E' : 'W'), offset);
  const end = port(target, vertical ? (target.y >= source.y ? 'N' : 'S') : (target.x >= source.x ? 'W' : 'E'), offset);
  return vertical
    ? [start.point, start.outer, { x: start.outer.x, y: (start.outer.y + end.outer.y) / 2 }, { x: end.outer.x, y: (start.outer.y + end.outer.y) / 2 }, end.outer, end.point]
    : [start.point, start.outer, { x: (start.outer.x + end.outer.x) / 2, y: start.outer.y }, { x: (start.outer.x + end.outer.x) / 2, y: end.outer.y }, end.outer, end.point];
}

function selfLoop(node: PositionedNode, offset: number): Point[] {
  const start = port(node, 'E', Math.min(-8, offset));
  const end = port(node, 'E', Math.max(8, offset));
  const x = node.x + node.width / 2 + Math.max(28, Math.abs(offset) + 18);
  return [start.point, { x, y: start.point.y }, { x, y: end.point.y }, end.point];
}

function normalize(points: Point[]): Point[] {
  const compact: Point[] = [];
  for (const point of points) {
    const last = compact.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) compact.push(point);
  }
  for (let i = 1; i < compact.length - 1;) {
    const before = compact[i - 1]!, current = compact[i]!, after = compact[i + 1]!;
    if ((before.x === current.x && current.x === after.x) || (before.y === current.y && current.y === after.y)) compact.splice(i, 1);
    else i++;
  }
  if (compact.length === 2) compact.splice(1, 0, { x: (compact[0]!.x + compact[1]!.x) / 2, y: (compact[0]!.y + compact[1]!.y) / 2 });
  return compact;
}

function chooseLabelPoint(points: readonly Point[], edge: LayoutEdge, nodes: readonly PositionedNode[]): Point {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
    lengths.push(length);
    total += length;
  }
  const label = edge.labelBBox;
  let best: { point: Point; cost: number } | undefined;
  let elapsed = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const length = lengths[i - 1]!;
    const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const needed = a.y === b.y ? label?.width ?? 0 : label?.height ?? 0;
    let cost = Math.abs(elapsed + length / 2 - total / 2) * 0.1 + (length < needed + 12 ? 150 : 0);
    if (label) {
      const box = { left: point.x - label.width / 2 - 4, right: point.x + label.width / 2 + 4,
        top: point.y - label.height / 2 - 4, bottom: point.y + label.height / 2 + 4 };
      for (const node of nodes) {
        if (node.isGroup) continue;
        const other = rect(node, 0);
        if (box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top) cost += 1000;
      }
    }
    if (!best || cost < best.cost) best = { point, cost };
    elapsed += length;
  }
  return best?.point ?? points[0]!;
}

function uniqueSorted(values: number[]): number[] { return [...new Set(values)].sort((a, b) => a - b); }
function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

class MinHeap {
  private items: Array<{ state: number; cost: number }> = [];
  get length(): number { return this.items.length; }
  push(state: number, cost: number): void {
    const items = this.items;
    let index = items.length;
    items.push({ state, cost });
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]!.cost <= cost) break;
      items[index] = items[parent]!;
      index = parent;
    }
    items[index] = { state, cost };
  }
  pop(): { state: number; cost: number } | undefined {
    const items = this.items;
    const first = items[0];
    const tail = items.pop();
    if (!first || !tail || items.length === 0) return first;
    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) break;
      if (child + 1 < items.length && items[child + 1]!.cost < items[child]!.cost) child++;
      if (items[child]!.cost >= tail.cost) break;
      items[index] = items[child]!;
      index = child;
    }
    items[index] = tail;
    return first;
  }
}
