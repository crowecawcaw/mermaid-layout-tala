import type { LayoutDirection, LayoutEdge, Point, PositionedEdge, PositionedNode } from './layout.js';
import { centerPort, shapePortPolicy, shapePorts, tableColumnPortIndex,
  type PortSide } from './tala/shape-ports.js';
import { outsideTopCenterLoopLabelBox, routeNodeLoops } from './tala/loop-routing.js';

type Side = 'N' | 'S' | 'E' | 'W';
type Axis = 0 | 1 | 2;
interface Rect { left: number; right: number; top: number; bottom: number }
interface Port { point: Point; outer: Point; side: Side }
type OccupiedPorts = Map<string, Map<string, string[]>>;

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
  const loopPaths = new Map<string, Point[]>();
  const loopsByNode = new Map<string, LayoutEdge[]>();
  for (const edge of edges) if (edge.from === edge.to) {
    const list = loopsByNode.get(edge.from) ?? [];
    list.push(edge);
    loopsByNode.set(edge.from, list);
  }
  for (const node of nodes) {
    const loops = loopsByNode.get(node.id);
    if (loops) for (const [id, points] of routeNodeLoops(node, loops)) loopPaths.set(id, points);
  }

  const occupied: OccupiedPorts = new Map();
  const routeOrder = [...edges].sort((a, b) => {
    const distance = (edge: LayoutEdge) => {
      const from = byId.get(edge.from)!, to = byId.get(edge.to)!;
      const dx = Math.max(0, Math.abs(from.x - to.x) - (from.width + to.width) / 2);
      const dy = Math.max(0, Math.abs(from.y - to.y) - (from.height + to.height) / 2);
      return Math.hypot(dx, dy);
    };
    return distance(a) - distance(b) || compareText(a.id, b.id);
  });
  const routed = routeOrder.map((edge) => {
    const source = byId.get(edge.from)!;
    const target = byId.get(edge.to)!;
    const offset = offsets.get(edge.id) ?? 0;
    const treePoints = canonicalTreePaths.get(edge.id);
    const loopPoints = loopPaths.get(edge.id);
    const points = treePoints ?? loopPoints ?? routeBetween(edge, source, target, nodes, byId,
      direction, offset, occupied);
    const compact = treePoints || loopPoints ? points : normalize(points);
    if (compact.length >= 2) {
      recordPort(occupied, source.id, compact[0]!, endpointArrow(edge, true));
      recordPort(occupied, target.id, compact.at(-1)!, endpointArrow(edge, false));
    }
    const loopLabel = loopPoints && edge.labelBBox
      ? outsideTopCenterLoopLabelBox(loopPoints, edge.labelBBox) : undefined;
    const middle = loopLabel ? { x: loopLabel.x + loopLabel.width / 2,
      y: loopLabel.y + loopLabel.height / 2 } : chooseLabelPoint(compact, edge, nodes);
    return { ...edge, points: compact, x: middle.x, y: middle.y };
  });
  return routed.sort((a, b) => compareText(a.id, b.id));
}

function routeBetween(
  edge: LayoutEdge,
  source: PositionedNode,
  target: PositionedNode,
  nodes: readonly PositionedNode[],
  byId: Map<string, PositionedNode>,
  direction: LayoutDirection,
  offset: number,
  occupied: OccupiedPorts
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
  const otherObstacles = nodes
    .filter((node) => !traversableAncestors.has(node.id))
    .map((node) => rect(node, CLEARANCE));
  // Tala's straight-route attempt can share a port coordinate inside the
  // overlap of two facing rectangular walls. Center ports alone would add
  // two bends when the boxes are slightly offset on the cross axis.
  if (offset === 0 && edge.fromTableColumnIndex === undefined
    && edge.toTableColumnIndex === undefined
    && (!source.shape || source.shape === 'rectangle')
    && (!target.shape || target.shape === 'rectangle')) {
    const left = Math.max(source.x - source.width / 2, target.x - target.width / 2);
    const right = Math.min(source.x + source.width / 2, target.x + target.width / 2);
    const upper = source.y < target.y ? source : target;
    const lower = upper === source ? target : source;
    if (left < right && upper.y + upper.height / 2 < lower.y - lower.height / 2) {
      const x = Math.round((left + right) / 2);
      const a = { x, y: upper.y + upper.height / 2 };
      const b = { x, y: lower.y - lower.height / 2 };
      const from = source === upper ? a : b, to = source === upper ? b : a;
      if (!segmentBlocked(a, b, otherObstacles)
        && occupiedPortCost(occupied, source, from, endpointArrow(edge, true)) === 0
        && occupiedPortCost(occupied, target, to, endpointArrow(edge, false)) === 0) {
        return [from, to];
      }
    }
  }
  const obstacles = [...otherObstacles];
  // A route may touch an endpoint boundary only at its chosen port. Keep both
  // endpoint interiors unavailable to the visibility search.
  obstacles.push(rect(source, CLEARANCE), rect(target, CLEARANCE));
  const tableSides = edge.fromTableColumnIndex !== undefined || edge.toTableColumnIndex !== undefined
    ? facingTableSides(source, target) : undefined;
  const pairs: Array<[Side, Side, number]> = tableSides
    ? [[tableSides[0], tableSides[1], 0]] : portPairs(source, target, direction);
  let best: { points: Point[]; cost: number } | undefined;
  for (const [startSide, endSide, preference] of pairs) {
    const start = port(source, startSide, offset,
      tableSides ? edge.fromTableColumnIndex : undefined);
    const end = port(target, endSide, offset,
      tableSides ? edge.toTableColumnIndex : undefined);
    const startCost = occupiedPortCost(occupied, source, start.point, endpointArrow(edge, true));
    const endCost = occupiedPortCost(occupied, target, end.point, endpointArrow(edge, false));
    if (!Number.isFinite(startCost) || !Number.isFinite(endCost)) continue;
    if (insideAny(start.outer, obstacles) || insideAny(end.outer, obstacles)) continue;
    const path = searchGrid(start.outer, end.outer, obstacles, startSide, endSide);
    if (!path) continue;
    const points = [start.point, ...path, end.point];
    const cost = routeCost(points) + preference + startCost + endCost;
    if (!best || cost < best.cost) best = { points, cost };
  }
  return best?.points ?? fallback(source, target, direction, offset, edge, tableSides);
}

function pointKey(point: Point): string { return `${point.x},${point.y}`; }

function endpointArrow(edge: LayoutEdge, source: boolean): string {
  const specified = source ? edge.sourceArrowhead : edge.targetArrowhead;
  if (specified !== undefined) return specified === '' ? 'none' : specified.toLowerCase();
  return source || edge.directed === false ? 'none' : 'triangle';
}

function recordPort(occupied: OccupiedPorts, nodeId: string, point: Point, arrow: string): void {
  const ports = occupied.get(nodeId) ?? new Map<string, string[]>();
  const key = pointKey(point);
  const arrows = ports.get(key) ?? [];
  arrows.push(arrow);
  ports.set(key, arrows);
  occupied.set(nodeId, ports);
}

function occupiedPortCost(occupied: OccupiedPorts, node: PositionedNode,
  point: Point, arrow: string): number {
  const arrows = occupied.get(node.id)?.get(pointKey(point));
  if (!arrows?.length) return 0;
  if (arrows.some((other) => other !== arrow)) return Infinity;
  return Math.max(node.width, node.height) / 2;
}

function facingTableSides(source: PositionedNode, target: PositionedNode): [Side, Side] | undefined {
  if (source.x + source.width / 2 < target.x - target.width / 2) return ['E', 'W'];
  if (target.x + target.width / 2 < source.x - source.width / 2) return ['W', 'E'];
  return undefined;
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
    // Let total route length and turns decide mixed-side ports. A fixed
    // penalty here can override the shorter one-turn route.
    [naturalX[0], naturalY[1], 0],
    [naturalY[0], naturalX[1], 0],
  ];
  const seen = new Set<string>();
  return candidates.filter(([a, b]) => {
    const key = a + b;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function port(node: PositionedNode, side: Side, offset: number, columnIndex?: number): Port {
  const xOffset = clamp(offset, -node.width / 2 + 2, node.width / 2 - 2);
  const yOffset = clamp(offset, -node.height / 2 + 2, node.height / 2 - 2);
  const portSide: PortSide = side === 'N' ? 'top' : side === 'S' ? 'bottom'
    : side === 'E' ? 'right' : 'left';
  let columnPoint: Point | undefined;
  if (columnIndex !== undefined && (portSide === 'left' || portSide === 'right')) {
    const policy = shapePortPolicy(node.shape, node.numColumns);
    const index = node.shape?.toLowerCase() === 'table'
      ? tableColumnPortIndex(node.numColumns ?? 0, portSide, columnIndex)
      : policy.indices[portSide][columnIndex];
    if (index !== undefined) columnPoint = shapePorts(node.shape,
      { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      node.width, node.height, node.numColumns)[index];
  }
  const shapeCenter = offset === 0 ? centerPort(node.shape, portSide,
    { x: node.x - node.width / 2, y: node.y - node.height / 2 },
    node.width, node.height, node.numColumns) : undefined;
  const point = columnPoint ?? shapeCenter ?? (side === 'N' ? { x: node.x + xOffset, y: node.y - node.height / 2 }
    : side === 'S' ? { x: node.x + xOffset, y: node.y + node.height / 2 }
    : side === 'E' ? { x: node.x + node.width / 2, y: node.y + yOffset }
    : { x: node.x - node.width / 2, y: node.y + yOffset });
  // The center of a nonrectangular shape can be recessed inside its box.
  // Start the visibility search beyond the entire endpoint box.
  const outer = side === 'N' ? { x: point.x, y: node.y - node.height / 2 - CLEARANCE }
    : side === 'S' ? { x: point.x, y: node.y + node.height / 2 + CLEARANCE }
    : side === 'E' ? { x: node.x + node.width / 2 + CLEARANCE, y: point.y }
    : { x: node.x - node.width / 2 - CLEARANCE, y: point.y };
  return { point, outer, side };
}

function searchGrid(start: Point, end: Point, obstacles: readonly Rect[],
  startSide: Side, endSide: Side): Point[] | undefined {
  const midX = (start.x + end.x) / 2, midY = (start.y + end.y) / 2;
  const xs = uniqueSorted([start.x, end.x, midX,
    ...obstacles.flatMap((box) => [box.left, box.right]),
    Math.min(start.x, end.x, ...obstacles.map((box) => box.left)) - CLEARANCE,
    Math.max(start.x, end.x, ...obstacles.map((box) => box.right)) + CLEARANCE]);
  const ys = uniqueSorted([start.y, end.y, midY,
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
  // Include the short segments between each port and the visibility grid in
  // turn scoring, including the final turn into the target port.
  const sideAxis = (side: Side): Axis => side === 'N' || side === 'S' ? 2 : 1;
  const startState = vertex(sx, sy) * 3 + sideAxis(startSide);
  distances[startState] = 0;
  const heap = new MinHeap();
  heap.push(startState, 0);
  let terminal = -1;
  let terminalCost = Infinity;
  while (heap.length) {
    const item = heap.pop()!;
    const state = item.state;
    if (item.cost !== distances[state]) continue;
    const at = Math.floor(state / 3);
    const axis = (state % 3) as Axis;
    if (item.cost > terminalCost) break;
    if (at === goal) {
      const cost = item.cost + (axis !== sideAxis(endSide) ? BEND_COST : 0);
      if (cost < terminalCost) { terminal = state; terminalCost = cost; }
      continue;
    }
    const x = at % columns, y = Math.floor(at / columns);
    for (const [nx, ny, nextAxis] of [[x - 1, y, 1], [x + 1, y, 1], [x, y - 1, 2], [x, y + 1, 2]] as const) {
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const neighbor = vertex(nx, ny);
      if (blocked[neighbor]) continue;
      const a = { x: xs[x]!, y: ys[y]! }, b = { x: xs[nx]!, y: ys[ny]! };
      if (segmentBlocked(a, b, obstacles)) continue;
      const next = neighbor * 3 + nextAxis;
      const turns = axis !== 0 && axis !== nextAxis;
      // When several shortest orthogonal routes tie, place the bend near the
      // midpoint of the clear channel, as Tala's route graph does.
      const midpointTie = turns ? (axis === 1 ? Math.abs(a.x - midX)
        : Math.abs(a.y - midY)) * 1e-6 : 0;
      const candidate = item.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        + (turns ? BEND_COST : 0) + midpointTie;
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

function fallback(source: PositionedNode, target: PositionedNode, direction: LayoutDirection,
  offset: number, edge: LayoutEdge, tableSides?: [Side, Side]): Point[] {
  const vertical = direction === 'TB' || direction === 'BT';
  const startSide = tableSides?.[0] ?? (vertical ? (target.y >= source.y ? 'S' : 'N')
    : (target.x >= source.x ? 'E' : 'W'));
  const endSide = tableSides?.[1] ?? (vertical ? (target.y >= source.y ? 'N' : 'S')
    : (target.x >= source.x ? 'W' : 'E'));
  const start = port(source, startSide, offset, tableSides ? edge.fromTableColumnIndex : undefined);
  const end = port(target, endSide, offset, tableSides ? edge.toTableColumnIndex : undefined);
  return tableSides ? [start.point, start.outer,
    { x: (start.outer.x + end.outer.x) / 2, y: start.outer.y },
    { x: (start.outer.x + end.outer.x) / 2, y: end.outer.y }, end.outer, end.point]
    : vertical
    ? [start.point, start.outer, { x: start.outer.x, y: (start.outer.y + end.outer.y) / 2 }, { x: end.outer.x, y: (start.outer.y + end.outer.y) / 2 }, end.outer, end.point]
    : [start.point, start.outer, { x: (start.outer.x + end.outer.x) / 2, y: start.outer.y }, { x: (start.outer.x + end.outer.x) / 2, y: end.outer.y }, end.outer, end.point];
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
  return compact;
}

export function chooseLabelPoint(points: readonly Point[], edge: LayoutEdge, nodes: readonly PositionedNode[]): Point {
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
