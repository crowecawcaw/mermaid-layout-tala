import { rankDag, type RankEdge, type RankNode } from './rank.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode extends RankNode {
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSpacing?: number;
  rankSpacing?: number;
  orderingPasses?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode extends LayoutNode {
  x: number;
  y: number;
  rank: number;
  order: number;
}

export interface PositionedEdge extends LayoutEdge {
  points: Point[];
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

interface WeightedEdge extends LayoutEdge {
  weight: number;
}

/**
 * TALA-derived layered layout for Mermaid flowcharts.
 *
 * The rank assignment is ported from TALA's weighted DAG network-simplex
 * ranker. This smaller adapter adds stable barycenter sweeps, variable-size
 * node spacing, component separation, and boundary-to-boundary orthogonal
 * paths. It does not implement TALA's grouping, general placement, or
 * obstacle-aware edge routing stages.
 */
export function layoutFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  const direction = options.direction ?? 'TB';
  const nodeSpacing = finiteSpacing(options.nodeSpacing ?? 48, 'nodeSpacing');
  const rankSpacing = finiteSpacing(options.rankSpacing ?? 64, 'rankSpacing');
  const passes = Math.max(1, Math.min(16, Math.floor(options.orderingPasses ?? 8)));
  const nodes = [...inputNodes].sort((a, b) => compareText(a.id, b.id));
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('duplicate node ID');
  for (const node of nodes) {
    if (!Number.isFinite(node.width) || node.width <= 0 || !Number.isFinite(node.height) || node.height <= 0) {
      throw new Error(`node ${node.id} must have finite positive dimensions`);
    }
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = [...inputEdges].sort((a, b) => compareText(a.id, b.id));
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) throw new Error('duplicate edge ID');
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error(`edge ${edge.id} references a missing node`);
  }

  const components = connectedComponents(nodes, edges);
  const allPositions = new Map<string, PositionedNode>();
  const componentBounds: Array<ReturnType<typeof bounds>> = [];
  for (const component of components) {
    const componentIds = new Set(component.map((node) => node.id));
    const componentEdges = edges.filter((edge) => componentIds.has(edge.from) && componentIds.has(edge.to));
    const weightedDag = makeAcyclic(component, componentEdges);
    const ranks = component.length === 1
      ? new Map([[component[0]!.id, 0]])
      : rankDag(component, weightedDag.map((edge) => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          weight: edge.weight,
        } satisfies RankEdge)));
    const localNodes = positionComponent(component, weightedDag, ranks, nodeSpacing, rankSpacing, passes, direction);
    for (const node of localNodes) allPositions.set(node.id, node);
    componentBounds.push(bounds(localNodes));
  }

  // Pack weakly connected components along the cross axis, which is the least
  // surprising direction for both tall and wide flowcharts.
  let componentOffset = 0;
  for (let i = 0; i < components.length; i++) {
    const local = components[i]!.map((node) => allPositions.get(node.id)!);
    const box = componentBounds[i]!;
    const alongX = direction === 'TB' || direction === 'BT';
    const shift = alongX ? componentOffset - box.minX : componentOffset - box.minY;
    for (const node of local) {
      if (alongX) node.x += shift;
      else node.y += shift;
    }
    componentOffset += (alongX ? box.width : box.height) + rankSpacing;
  }

  const positionedNodes = nodes.map((node) => allPositions.get(node.id)!);
  const edgeGroups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}`;
    const group = edgeGroups.get(key) ?? [];
    group.push(edge);
    edgeGroups.set(key, group);
  }
  const parallelOffset = new Map<string, number>();
  for (const [key, group] of edgeGroups) {
    group.forEach((edge, i) => parallelOffset.set(edge.id, (i - (group.length - 1) / 2) * 10));
  }
  const positionedEdges = edges.map((edge) => {
    const source = allPositions.get(edge.from)!;
    const target = allPositions.get(edge.to)!;
    const offset = parallelOffset.get(edge.id) ?? 0;
    const points = normalizeRoute(routeEdge(source, target, direction, offset));
    const middle = points[Math.floor(points.length / 2)]!;
    return { ...edge, points, x: middle.x, y: middle.y };
  });
  return { nodes: positionedNodes, edges: positionedEdges };
}

function makeAcyclic(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): WeightedEdge[] {
  const byPair = new Map<string, WeightedEdge>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue; // Loops are routed after ranking.
    const key = `${edge.from}\u0000${edge.to}`;
    const previous = byPair.get(key);
    if (previous) {
      previous.weight++;
      if (compareText(edge.id, previous.id) < 0) previous.id = edge.id;
    } else {
      byPair.set(key, { ...edge, weight: 1 });
    }
  }
  const outgoing = new Map(nodes.map((node) => [node.id, [] as WeightedEdge[]]));
  for (const edge of byPair.values()) outgoing.get(edge.from)!.push(edge);
  for (const list of outgoing.values()) list.sort((a, b) => compareText(a.to, b.to) || compareText(a.id, b.id));

  // A deterministic DFS marks only back edges as feedback edges. Keeping the
  // DFS tree guarantees the remaining ranking graph stays connected.
  const color = new Map(nodes.map((node) => [node.id, 0]));
  const dag: WeightedEdge[] = [];
  const visit = (id: string) => {
    color.set(id, 1);
    for (const edge of outgoing.get(id)!) {
      const targetColor = color.get(edge.to)!;
      if (targetColor === 1) continue;
      dag.push(edge);
      if (targetColor === 0) visit(edge.to);
    }
    color.set(id, 2);
  };
  for (const node of nodes) if (color.get(node.id) === 0) visit(node.id);
  return dag;
}

function connectedComponents(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutNode[][] {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }
  const visited = new Set<string>();
  const components: LayoutNode[][] = [];
  for (const start of nodes) {
    if (visited.has(start.id)) continue;
    visited.add(start.id);
    const queue = [start.id];
    const component: LayoutNode[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor]!;
      component.push(nodes.find((node) => node.id === id)!);
      for (const neighbor of adjacency.get(id)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    component.sort((a, b) => compareText(a.id, b.id));
    components.push(component);
  }
  return components;
}

function positionComponent(
  nodes: readonly LayoutNode[],
  edges: readonly WeightedEdge[],
  ranks: Map<string, number>,
  nodeSpacing: number,
  rankSpacing: number,
  passes: number,
  direction: LayoutDirection
): PositionedNode[] {
  const maxRank = Math.max(0, ...ranks.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const node of nodes) layers[ranks.get(node.id) ?? 0]!.push(node.id);
  for (const layer of layers) layer.sort(compareText);
  const order = new Map<string, number>();
  const saveOrder = (layer: string[]) => layer.forEach((id, index) => order.set(id, index));
  layers.forEach(saveOrder);

  const incoming = new Map(nodes.map((node) => [node.id, [] as WeightedEdge[]]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as WeightedEdge[]]));
  for (const edge of edges) {
    incoming.get(edge.to)!.push(edge);
    outgoing.get(edge.from)!.push(edge);
  }
  const reorder = (
    layerIndex: number,
    adjacentRank: number,
    adjacent: Map<string, WeightedEdge[]>,
    neighbor: (edge: WeightedEdge) => string
  ) => {
    const layer = layers[layerIndex]!;
    const stableOrder = new Map(layer.map((id, i) => [id, i]));
    const barycenter = (id: string) => {
      const links = adjacent.get(id)!.filter((edge) => ranks.get(neighbor(edge)) === adjacentRank);
      if (links.length === 0) return order.get(id) ?? 0;
      let total = 0;
      let weight = 0;
      for (const edge of links) {
        total += (order.get(neighbor(edge)) ?? 0) * edge.weight;
        weight += edge.weight;
      }
      return total / weight;
    };
    layer.sort((a, b) => barycenter(a) - barycenter(b) || stableOrder.get(a)! - stableOrder.get(b)! || compareText(a, b));
    saveOrder(layer);
  };
  for (let pass = 0; pass < passes; pass++) {
    for (let layer = 1; layer < layers.length; layer++) reorder(layer, layer - 1, incoming, (edge) => edge.from);
    for (let layer = layers.length - 2; layer >= 0; layer--) reorder(layer, layer + 1, outgoing, (edge) => edge.to);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const horizontal = direction === 'LR' || direction === 'RL';
  const bandSizes = layers.map((layer) => Math.max(0, ...layer.map((id) => {
    const node = nodeById.get(id)!;
    return horizontal ? node.width : node.height;
  })));
  const rankCenters: number[] = [];
  let cursor = 0;
  for (const bandSize of bandSizes) {
    rankCenters.push(cursor + bandSize / 2);
    cursor += bandSize + rankSpacing;
  }

  const crossWidths = layers.map((layer) => layer.reduce((sum, id) => {
    const node = nodeById.get(id)!;
    return sum + (horizontal ? node.height : node.width);
  }, 0) + Math.max(0, layer.length - 1) * nodeSpacing);
  const maxCrossWidth = Math.max(0, ...crossWidths);
  const result: PositionedNode[] = [];
  for (let rank = 0; rank < layers.length; rank++) {
    const layer = layers[rank]!;
    let cross = (maxCrossWidth - crossWidths[rank]!) / 2;
    for (let position = 0; position < layer.length; position++) {
      const id = layer[position]!;
      const node = nodeById.get(id)!;
      const crossSize = horizontal ? node.height : node.width;
      const crossCenter = cross + crossSize / 2;
      const along = rankCenters[rank]!;
      let x = horizontal ? along : crossCenter;
      let y = horizontal ? crossCenter : along;
      if (direction === 'BT') y = -y;
      if (direction === 'RL') x = -x;
      result.push({ ...node, x, y, rank, order: position });
      cross += crossSize + nodeSpacing;
    }
  }
  return result;
}

function routeEdge(source: PositionedNode, target: PositionedNode, direction: LayoutDirection, offset: number): Point[] {
  if (source.id === target.id) {
    const x = source.x + source.width / 2;
    const y = source.y;
    const upper = y - Math.min(8, source.height / 4);
    const lower = y + Math.min(8, source.height / 4);
    const outside = source.x + source.width / 2 + Math.max(28, Math.abs(offset) + 18);
    return [
      { x, y: upper },
      { x: outside, y: upper },
      { x: outside, y: lower },
      { x, y: lower },
    ];
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const start = rectIntersection(source, dx, dy);
  const end = rectIntersection(target, -dx, -dy);
  const vertical = direction === 'TB' || direction === 'BT';
  if (vertical) {
    const startLane = shiftAlongBoundary(source, start, offset, true);
    const endLane = shiftAlongBoundary(target, end, offset, true);
    const midY = (start.y + end.y) / 2;
    return [
      start,
      startLane,
      { x: startLane.x, y: midY },
      { x: endLane.x, y: midY },
      endLane,
      end,
    ];
  }
  const startLane = shiftAlongBoundary(source, start, offset, false);
  const endLane = shiftAlongBoundary(target, end, offset, false);
  const midX = (start.x + end.x) / 2;
  return [
    start,
    startLane,
    { x: midX, y: startLane.y },
    { x: midX, y: endLane.y },
    endLane,
    end,
  ];
}

/**
 * Mermaid's edge renderer rounds orthogonal corners by looking at adjacent
 * segments. Repeated points make those segments zero length and produce NaN
 * coordinates, so remove them before handing routes to Mermaid. Keep an
 * interior point on straight routes because Mermaid clips the first and last
 * points against the node boundaries.
 */
function normalizeRoute(points: Point[]): Point[] {
  const compact = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1]!;
    return point.x !== previous.x || point.y !== previous.y;
  });
  if (compact.length === 2) {
    const [start, end] = compact as [Point, Point];
    compact.splice(1, 0, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
  }
  return compact;
}

function shiftAlongBoundary(node: PositionedNode, point: Point, offset: number, verticalRoute: boolean): Point {
  if (offset === 0) return point;
  const onHorizontalSide = Math.abs(Math.abs(point.y - node.y) - node.height / 2) < 1e-7;
  const tangentIsX = verticalRoute ? onHorizontalSide : !onHorizontalSide;
  if (tangentIsX) {
    const limit = Math.max(0, node.width / 2 - 2);
    return { x: node.x + clamp(point.x - node.x + offset, -limit, limit), y: point.y };
  }
  const limit = Math.max(0, node.height / 2 - 2);
  return { x: point.x, y: node.y + clamp(point.y - node.y + offset, -limit, limit) };
}

function rectIntersection(node: PositionedNode, dx: number, dy: number): Point {
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

function bounds(nodes: readonly PositionedNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function finiteSpacing(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite nonnegative number`);
  return value;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
