import type { Point, PositionedNode } from './layout.js';

type Box = { left: number; right: number; top: number; bottom: number };
const epsilon = 1e-7;
const boxOf = (node: PositionedNode): Box => ({
  left: node.x - node.width / 2, right: node.x + node.width / 2,
  top: node.y - node.height / 2, bottom: node.y + node.height / 2,
});

/** True only for interior intersections; touching a rectangle boundary is legal. */
export function crossesBox(a: Point, b: Point, box: Box): boolean {
  if (a.x === b.x) return a.x > box.left + epsilon && a.x < box.right - epsilon
    && Math.max(a.y, b.y) > box.top + epsilon && Math.min(a.y, b.y) < box.bottom - epsilon;
  if (a.y === b.y) return a.y > box.top + epsilon && a.y < box.bottom - epsilon
    && Math.max(a.x, b.x) > box.left + epsilon && Math.min(a.x, b.x) < box.right - epsilon;
  throw new Error('routing requires orthogonal segments');
}

/** Rectangle visibility-grid search with a bend penalty and deterministic ties.
 * This is a native fallback, not a translation of upstream TALA's OVG router.
 */
export function avoidObstacles(
  preferred: Point[], source: PositionedNode, target: PositionedNode,
  nodes: readonly PositionedNode[], offset = 0
): Point[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = new Set<string>();
  for (const endpoint of [source, target]) {
    let parent = endpoint.parentId;
    while (parent !== undefined) {
      if (ancestors.has(parent)) break;
      ancestors.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  // Endpoint ancestors enclose the route rather than obstructing it. When a
  // group itself is an endpoint, allow routes to its descendants from inside.
  const contains = (group: PositionedNode, node: PositionedNode) => {
    let parent = node.parentId;
    while (parent !== undefined) {
      if (parent === group.id) return true;
      parent = byId.get(parent)?.parentId;
    }
    return false;
  };
  const boxes = nodes.filter((node) => !ancestors.has(node.id)
    && !(node.id === source.id && contains(source, target))
    && !(node.id === target.id && contains(target, source))).map(boxOf);
  const clear = (a: Point, b: Point) => !boxes.some((box) => crossesBox(a, b, box));
  if (preferred.every((p, i) => i === 0 || clear(preferred[i - 1]!, p))) return preferred;

  const ports = (node: PositionedNode): Point[] => {
    const dx = Math.max(-node.width / 3, Math.min(node.width / 3, offset));
    const dy = Math.max(-node.height / 3, Math.min(node.height / 3, offset));
    return [
      { x: node.x + dx, y: node.y - node.height / 2 },
      { x: node.x + node.width / 2, y: node.y + dy },
      { x: node.x + dx, y: node.y + node.height / 2 },
      { x: node.x - node.width / 2, y: node.y + dy },
    ];
  };
  const starts = source.id === target.id ? [preferred[0]!] : ports(source);
  const ends = source.id === target.id ? [preferred.at(-1)!] : ports(target);
  const clearance = 12 + Math.abs(offset);
  const xs = [...new Set([...starts, ...ends, ...preferred].map((p) => p.x)
    .concat(boxes.flatMap((b) => [b.left - clearance, b.right + clearance])))].sort((a, b) => a - b);
  const ys = [...new Set([...starts, ...ends, ...preferred].map((p) => p.y)
    .concat(boxes.flatMap((b) => [b.top - clearance, b.bottom + clearance])))].sort((a, b) => a - b);
  if (xs.length * ys.length > 250_000) throw new Error('obstacle routing grid exceeds 250000 points');
  const width = xs.length;
  const index = (p: Point) => ys.indexOf(p.y) * width + xs.indexOf(p.x);
  const point = (i: number): Point => ({ x: xs[i % width]!, y: ys[Math.floor(i / width)]! });
  const goals = new Set(ends.map(index));
  const size = xs.length * ys.length * 3;
  const distance = new Float64Array(size).fill(Infinity);
  const previous = new Int32Array(size).fill(-1);
  // State includes incoming axis: 0 at a source port, 1 horizontal, 2 vertical.
  const heap: Array<{ state: number; cost: number }> = [];
  const less = (a: { state: number; cost: number }, b: { state: number; cost: number }) =>
    a.cost < b.cost || (a.cost === b.cost && a.state < b.state);
  const push = (entry: { state: number; cost: number }) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(entry, heap[parent]!)) break;
      heap[i] = heap[parent]!;
      i = parent;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && less(heap[child + 1]!, heap[child]!)) child++;
        if (!less(heap[child]!, last)) break;
        heap[i] = heap[child]!;
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  for (const p of starts) {
    const state = index(p) * 3;
    distance[state] = 0;
    push({ state, cost: 0 });
  }
  while (heap.length) {
    const { state, cost } = pop();
    if (cost !== distance[state]) continue;
    const cell = Math.floor(state / 3);
    if (goals.has(cell) && previous[state] !== -1) {
      const route: Point[] = [];
      for (let s = state; s !== -1; s = previous[s]!) route.push(point(Math.floor(s / 3)));
      route.reverse();
      return simplifyRoute(route);
    }
    const x = cell % width;
    const y = Math.floor(cell / width);
    const a = point(cell);
    const neighbors = [x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
      y > 0 ? cell - width : -1, y + 1 < ys.length ? cell + width : -1];
    for (const next of neighbors) {
      if (next < 0) continue;
      const b = point(next);
      if (!clear(a, b)) continue;
      const axis = a.y === b.y ? 1 : 2;
      const nextState = next * 3 + axis;
      const nextCost = cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        + (state % 3 !== 0 && state % 3 !== axis ? 20 : 0);
      if (nextCost >= distance[nextState]!) continue;
      distance[nextState] = nextCost;
      previous[nextState] = state;
      push({ state: nextState, cost: nextCost });
    }
  }
  throw new Error(`no obstacle-free route for ${source.id} -> ${target.id}`);
}

export function simplifyRoute(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    const b = result.at(-1);
    if (b && b.x === p.x && b.y === p.y) continue;
    const a = result.at(-2);
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) result.pop();
    result.push(p);
  }
  if (result.length === 2) result.splice(1, 0, routeMidpoint(result));
  return result;
}

/** Arc-length midpoint, including straight and uneven multi-segment routes. */
export function routeMidpoint(points: readonly Point[]): Point {
  let remaining = 0;
  for (let i = 1; i < points.length; i++) remaining += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) return { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length };
    remaining -= length;
  }
  return { ...points[0]! };
}
