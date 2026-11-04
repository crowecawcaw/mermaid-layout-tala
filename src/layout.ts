import { rankDag, type RankEdge, type RankNode } from './rank.js';
import { layoutCompound } from './compound.js';
import { avoidObstacles, routeMidpoint } from './routing.js';
import { placeEdgeLabels } from './labeling.js';
import { normalizeLayout } from './normalize.js';
import { prescaleNodes, routeLoops } from './loops.js';
import { GoRandom, getTalaSeeds, normalizeSeeds, type TalaSeed } from './random.js';
import { compareScores, evaluateLayout, type LayoutScore } from './quality.js';
import { alignHierarchy, breakLongConnections, connectHierarchy, globalSifting, hierarchyNode, initializeRanks, minimizeCrossings, type Layers } from './hierarchy.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode extends RankNode {
  width: number;
  height: number;
  fixedSize?: boolean;
  parentId?: string;
  isGroup?: boolean;
  direction?: LayoutDirection;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  sourceArrowhead?: string;
  targetArrowhead?: string;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSpacing?: number;
  rankSpacing?: number;
  orderingPasses?: number;
  containerPadding?: number;
  seeds?: readonly TalaSeed[];
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
  labelX?: number;
  labelY?: number;
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
 * ranker. This smaller adapter adds upstream crossing minimization, sifting and alignment, variable-size
 * node spacing, component separation, and boundary-to-boundary orthogonal
 * paths. Native container placement, obstacle routing, and label placement
 * extend this slice; they do not reproduce the upstream engine pipeline.
 */
export function layoutFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  const seeds = options.seeds === undefined ? getTalaSeeds() : normalizeSeeds(options.seeds);
  let best: LayoutResult | undefined;
  let bestScore: LayoutScore | undefined;
  let failure: unknown;
  for (const seed of seeds) {
    try {
      const candidate = layoutAttempt(inputNodes, inputEdges, options, new GoRandom(seed));
      normalizeLayout(candidate);
      const score = evaluateLayout(candidate);
      // Upstream deliberately favors the later configured seed on exact ties.
      if (!bestScore || compareScores(score, bestScore) <= 0) { best = candidate; bestScore = score; }
    } catch (error) { failure = error; }
  }
  if (!best) throw failure;
  return best;
}

function layoutAttempt(
  inputNodes: readonly LayoutNode[], inputEdges: readonly LayoutEdge[], options: LayoutOptions, random: GoRandom
): LayoutResult {
  const direction = options.direction ?? 'TB';
  if (!['TB', 'BT', 'LR', 'RL'].includes(direction)) throw new Error('invalid layout direction');
  const nodeSpacing = finiteSpacing(options.nodeSpacing ?? 48, 'nodeSpacing');
  let rankSpacing = finiteSpacing(options.rankSpacing ?? 64, 'rankSpacing');
  const requestedPasses = options.orderingPasses;
  if (requestedPasses !== undefined && !Number.isFinite(requestedPasses)) throw new Error('orderingPasses must be finite');
  const passes = requestedPasses === undefined ? undefined : Math.max(1, Math.min(16, Math.floor(requestedPasses)));
  finiteSpacing(options.containerPadding ?? 24, 'containerPadding');
  const nodes = inputNodes.map((node) => ({ ...node })).sort((a, b) => compareText(a.id, b.id));
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
    finiteSpacing(edge.labelWidth ?? 0, 'labelWidth');
    finiteSpacing(edge.labelHeight ?? 0, 'labelHeight');
    const labelExtent = direction === 'LR' || direction === 'RL' ? edge.labelWidth : edge.labelHeight;
    if (labelExtent) rankSpacing = Math.max(rankSpacing, labelExtent + 16);
  }
  prescaleNodes(nodes, edges);
  if (nodes.some((node) => node.isGroup || node.parentId !== undefined)) {
    return layoutCompound(nodes, edges, options, (localNodes, localEdges, localOptions) => layoutAttempt(localNodes, localEdges, localOptions, random), routeEdge);
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
    const localNodes = positionComponent(component, weightedDag, ranks, nodeSpacing, rankSpacing, passes, direction, random);
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
    const key = JSON.stringify([edge.from, edge.to]);
    const group = edgeGroups.get(key) ?? [];
    group.push(edge);
    edgeGroups.set(key, group);
  }
  const parallelOffset = new Map<string, number>();
  for (const group of edgeGroups.values()) {
    group.forEach((edge, i) => parallelOffset.set(edge.id, (edge.from === edge.to ? i : i - (group.length - 1) / 2) * 10));
  }
  const loopRoutes = new Map<string, Point[]>();
  for (const node of positionedNodes) for (const [id, points] of routeLoops(node, edges)) loopRoutes.set(id, points);
  const positionedEdges = edges.map((edge) => {
    const source = allPositions.get(edge.from)!;
    const target = allPositions.get(edge.to)!;
    const offset = parallelOffset.get(edge.id) ?? 0;
    const points = normalizeRoute(avoidObstacles(loopRoutes.get(edge.id) ?? routeEdge(source, target, direction, offset), source, target, positionedNodes, offset));
    const middle = routeMidpoint(points);
    return { ...edge, points, x: middle.x, y: middle.y };
  });
  placeEdgeLabels(positionedNodes, positionedEdges);
  return { nodes: positionedNodes, edges: positionedEdges };
}

function makeAcyclic(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): WeightedEdge[] {
  const byPair = new Map<string, WeightedEdge>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue; // Loops are routed after ranking.
    const key = JSON.stringify([edge.from, edge.to]);
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
  passes: number | undefined,
  direction: LayoutDirection,
  random: GoRandom
): PositionedNode[] {
  const horizontal = direction === 'LR' || direction === 'RL';
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placement = new Map(nodes.map((node) => [node.id,
    hierarchyNode(node.id, ranks.get(node.id) ?? 0, horizontal ? node.height : node.width)]));
  const layers: Layers = Array.from({ length: Math.max(0, ...ranks.values()) + 1 }, () => []);
  const initial = [...placement.values()];
  random.shuffle(initial);
  for (const node of initial) layers[node.level]!.push(node);
  for (const edge of edges) {
    const source = placement.get(edge.from)!;
    const target = placement.get(edge.to)!;
    connectHierarchy(source, target);
    source.degree += edge.weight;
    target.degree += edge.weight;
  }
  initializeRanks(layers);
  breakLongConnections(initial, layers);
  minimizeCrossings(layers, passes);
  globalSifting(layers);
  // Alignment's median-neighbor ordering uses the initial ordered geometry.
  for (const layer of layers) {
    let cursor = 0;
    for (const node of layer) { node.x = cursor; cursor += node.width + nodeSpacing; }
  }
  const crossPositions = alignHierarchy(layers, nodeSpacing, Math.min(50, nodeSpacing));
  const result: PositionedNode[] = [];
  let along = 0;
  for (const layer of layers) {
    const bandSize = Math.max(0, ...layer.filter((node) => !node.dummy).map((node) => {
      const original = nodeById.get(node.id)!;
      return horizontal ? original.width : original.height;
    }));
    for (const node of layer) {
      if (node.dummy) continue;
      const original = nodeById.get(node.id)!;
      const cross = crossPositions.get(node)! + node.width / 2;
      let x = horizontal ? along + bandSize / 2 : cross;
      let y = horizontal ? cross : along + bandSize / 2;
      if (direction === 'BT') y = -y;
      if (direction === 'RL') x = -x;
      result.push({ ...original, x, y, rank: node.level, order: node.rank });
    }
    along += bandSize + rankSpacing;
  }
  return result;
}

function routeEdge(source: PositionedNode, target: PositionedNode, direction: LayoutDirection, offset: number): Point[] {
  if (source.id === target.id) {
    const x = source.x + source.width / 2;
    const y = source.y;
    const upper = y - Math.min(8, source.height / 4);
    const lower = y + Math.min(8, source.height / 4);
    const outside = source.x + source.width / 2 + Math.max(18, 28 + offset);
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
    const startLane = shiftAlongBoundary(source, start, offset);
    const endLane = shiftAlongBoundary(target, end, offset);
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
  const startLane = shiftAlongBoundary(source, start, offset);
  const endLane = shiftAlongBoundary(target, end, offset);
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

function shiftAlongBoundary(node: PositionedNode, point: Point, offset: number): Point {
  if (offset === 0) return point;
  const onHorizontalSide = Math.abs(Math.abs(point.y - node.y) - node.height / 2) < 1e-7;
  const tangentIsX = onHorizontalSide;
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
