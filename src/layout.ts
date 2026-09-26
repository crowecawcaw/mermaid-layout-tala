import { rankDag, type RankEdge, type RankNode } from './rank.js';
import { routeGraphEdges } from './route.js';
import { TalaGraph } from './tala/graph.js';
import { addHubs } from './tala/proximity.js';
import { countNonSharedCrossings } from './tala/crossings.js';
import { placeOrdinaryNodes } from './tala/ordinary-placement.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode extends RankNode {
  width: number;
  height: number;
  parentId?: string | undefined;
  isGroup?: boolean | undefined;
  labelBBox?: { width: number; height: number } | undefined;
  dir?: LayoutDirection | undefined;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  directed?: boolean;
  labelBBox?: { width: number; height: number };
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  strategy?: 'tala' | 'layered';
  nodeSpacing?: number;
  rankSpacing?: number;
  orderingPasses?: number;
  seeds?: readonly number[];
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
 * ranker. The Mermaid adapter also places nested containers, tests
 * deterministic ordering seeds, and routes around node obstacles.
 */
export function layoutFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  const seeds = normalizeSeeds(options.seeds ?? [1, 2, 3]);
  // Mermaid's parser order is not a placement constraint. Normalize only at
  // the adapter boundary; the TALA graph retains caller order like upstream.
  const graph = TalaGraph.fromFlowchart(
    [...inputNodes].sort((a, b) => compareText(a.id, b.id)),
    [...inputEdges].sort((a, b) => compareText(a.id, b.id)),
    options.direction ?? 'TB'
  );
  let selected: LayoutResult | undefined;
  let selectedScore: { penalty: number; area: number } | undefined;
  for (const seed of seeds) {
    const attempt = graph.clone();
    addHubs(attempt);
    const nodes = attempt.toLayoutNodes();
    const edges = attempt.toLayoutEdges();
    const candidate = nodes.some((node) => node.isGroup)
      ? layoutCompoundFlowchart(nodes, edges, options, seed)
      : layoutFlatFlowchart(nodes, edges, options, seed);
    attempt.applyResult(candidate);
    const score = scoreLayout(candidate, options.direction ?? 'TB');
    if (!selectedScore || score.penalty < selectedScore.penalty
      || (score.penalty === selectedScore.penalty && score.area <= selectedScore.area)) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return selected!;
}

function layoutFlatFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {},
  seed = 1
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
    const useOrdinary = options.strategy === 'tala'
      || options.strategy !== 'layered' && options.nodeSpacing === undefined
        && options.rankSpacing === undefined && options.orderingPasses === undefined;
    const localNodes = useOrdinary && component.length > 1 && component.every((node) => !node.isGroup)
      ? positionOrdinaryComponent(component, componentEdges, ranks, direction, seed)
      : positionComponent(component, weightedDag, ranks, nodeSpacing, rankSpacing, passes, direction, seed);
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
    const rankShift = alongX ? -box.minY : -box.minX;
    for (const node of local) {
      if (alongX) { node.x += shift; node.y += rankShift; }
      else { node.y += shift; node.x += rankShift; }
    }
    componentOffset += (alongX ? box.width : box.height) + rankSpacing;
  }

  const positionedNodes = nodes.map((node) => allPositions.get(node.id)!);
  const positionedEdges = routeGraphEdges(positionedNodes, edges, direction);
  return { nodes: positionedNodes, edges: positionedEdges };
}

function positionOrdinaryComponent(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  ranks: ReadonlyMap<string, number>, direction: LayoutDirection, seed: number): PositionedNode[] {
  const graph = TalaGraph.fromFlowchart(nodes.map((node) => ({ ...node, parentId: undefined })), edges, direction);
  placeOrdinaryNodes(graph, seed);
  const crossAxis = direction === 'TB' || direction === 'BT' ? 'x' : 'y';
  const orderById = new Map<string, number>();
  const byRank = new Map<number, typeof graph.nodes>();
  for (const node of graph.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const row = byRank.get(rank) ?? [];
    row.push(node);
    byRank.set(rank, row);
  }
  for (const row of byRank.values()) {
    row.sort((a, b) => a.topLeft![crossAxis] - b.topLeft![crossAxis] || compareText(a.id, b.id));
    row.forEach((node, index) => orderById.set(node.id, index));
  }
  const inputById = new Map(nodes.map((node) => [node.id, node]));
  return graph.nodes.map((node) => ({
    ...inputById.get(node.id)!,
    x: node.topLeft!.x + node.width / 2,
    y: node.topLeft!.y + node.height / 2,
    rank: ranks.get(node.id) ?? 0,
    order: orderById.get(node.id)!,
  }));
}

/** Place each container from the inside out, then lay out its siblings as nodes.
 * TALA's container pass also treats a compound node as one obstacle during
 * parent placement. This keeps nested groups and their labels inside their
 * boundaries while edges between groups still affect the parent hierarchy. */
function layoutCompoundFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions,
  seed: number
): LayoutResult {
  const nodes = [...inputNodes].sort((a, b) => compareText(a.id, b.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('duplicate node ID');
  for (const node of nodes) {
    if (node.parentId && !byId.get(node.parentId)?.isGroup) throw new Error(`invalid parent for ${node.id}`);
    if (node.parentId === node.id) throw new Error(`cyclic parent for ${node.id}`);
  }
  for (const edge of inputEdges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error(`edge ${edge.id} references a missing node`);
  }
  const children = new Map<string | undefined, LayoutNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const childUnder = (id: string, parentId: string | undefined): string | undefined => {
    const visited = new Set<string>();
    let current = byId.get(id);
    while (current) {
      if (visited.has(current.id)) throw new Error('cyclic container hierarchy');
      visited.add(current.id);
      if (current.parentId === parentId) return current.id;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return undefined;
  };
  interface Scope { width: number; height: number; positioned: PositionedNode[] }
  const active = new Set<string>();
  const placeScope = (parentId: string | undefined, direction: LayoutDirection): Scope => {
    if (parentId) {
      if (active.has(parentId)) throw new Error('cyclic container hierarchy');
      active.add(parentId);
    }
    const siblingNodes = children.get(parentId) ?? [];
    const nested = new Map<string, Scope>();
    const measured = siblingNodes.map((node) => {
      if (!node.isGroup) return node;
      const childScope = placeScope(node.id, node.dir ?? direction);
      nested.set(node.id, childScope);
      return { ...node, width: childScope.width, height: childScope.height };
    });
    const projected: LayoutEdge[] = [];
    for (const edge of inputEdges) {
      const from = childUnder(edge.from, parentId);
      const to = childUnder(edge.to, parentId);
      if (from && to && from !== to) projected.push({ id: edge.id, from, to });
    }
    const flat = layoutFlatFlowchart(measured, projected, { ...options, direction }, seed);
    const box = bounds(flat.nodes);
    const group = parentId ? byId.get(parentId)! : undefined;
    const padding = 32;
    const topPadding = group ? Math.max(48, (group.labelBBox?.height ?? 0) + 28) : 0;
    const width = group ? Math.max(box.width + 2 * padding, (group.labelBBox?.width ?? group.width) + 2 * padding) : box.width;
    const height = group ? Math.max(box.height + topPadding + padding, topPadding + padding) : box.height;
    const shiftX = group ? -box.minX + (width - box.width) / 2 - width / 2 : 0;
    const shiftY = group ? -box.minY + topPadding - height / 2 : 0;
    const positioned: PositionedNode[] = [];
    for (const placed of flat.nodes) {
      const outer = { ...placed, x: placed.x + shiftX, y: placed.y + shiftY };
      positioned.push(outer);
      const inner = nested.get(placed.id);
      if (inner) {
        for (const descendant of inner.positioned) {
          positioned.push({ ...descendant, x: descendant.x + outer.x, y: descendant.y + outer.y });
        }
      }
    }
    if (parentId) active.delete(parentId);
    return { width, height, positioned };
  };
  const placed = placeScope(undefined, options.direction ?? 'TB').positioned;
  const edges = routeGraphEdges(placed, inputEdges, options.direction ?? 'TB');
  return { nodes: placed, edges };
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
  direction: LayoutDirection,
  seed: number
): PositionedNode[] {
  const maxRank = Math.max(0, ...ranks.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const node of nodes) layers[ranks.get(node.id) ?? 0]!.push(node.id);
  for (const layer of layers) layer.sort((a, b) => seededOrder(a, seed) - seededOrder(b, seed) || compareText(a, b));
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

function bounds(nodes: readonly PositionedNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function normalizeSeeds(seeds: readonly number[]): number[] {
  if (seeds.length === 0) throw new Error('TALA requires at least one seed');
  if (seeds.length > 64) throw new Error('TALA accepts at most 64 seed entries');
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const seed of seeds) {
    if (!Number.isSafeInteger(seed)) throw new Error('TALA seeds must be safe integers');
    if (seen.has(seed)) continue;
    seen.add(seed);
    unique.push(seed);
    if (unique.length > 16) throw new Error('TALA supports at most 16 unique seeds');
  }
  return unique;
}

function seededOrder(id: string, seed: number): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
}

function scoreLayout(result: LayoutResult, direction: LayoutDirection): { penalty: number; area: number } {
  let penalty = 0;
  const positions = new Map(result.nodes.map((node) => [node.id, node]));
  for (const edge of result.edges) {
    if (edge.directed !== false) {
      const from = positions.get(edge.from), to = positions.get(edge.to);
      if (from && to) {
        const progress = direction === 'TB' ? to.y - from.y : direction === 'BT' ? from.y - to.y
          : direction === 'LR' ? to.x - from.x : from.x - to.x;
        if (progress <= 0) penalty += 1000 - progress;
      }
    }
    penalty += Math.max(0, edge.points.length - 2) * 0.5;
    for (let i = 1; i < edge.points.length; i++) {
      const previous = edge.points[i - 1]!, current = edge.points[i]!;
      if (previous.x !== current.x && previous.y !== current.y) penalty += 3;
    }
  }
  penalty += countNonSharedCrossings(result.edges);
  const box = bounds(result.nodes);
  return { penalty, area: box.width * box.height };
}

function finiteSpacing(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite nonnegative number`);
  return value;
}

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
