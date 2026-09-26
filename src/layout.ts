import { rankDag, type RankEdge, type RankNode } from './rank.js';
import { chooseLabelPoint, routeGraphEdges } from './route.js';
import { TalaGraph, type EdgeEndpointReplacement, type EdgeEndpointReplacements,
  type ProjectedChildGeometry } from './tala/graph.js';
import { addHubs } from './tala/proximity.js';
import { countNonSharedCrossings } from './tala/crossings.js';
import { placeOrdinaryNodes } from './tala/ordinary-placement.js';
import { placeSimpleTree } from './tala/simple-tree.js';
import { extractFlatTrees, type TreeExtraction } from './tala/tree-extraction.js';
import { canonicalTreePaths } from './tala/tree-routing.js';
import { prescaleNodes } from './tala/prescale.js';
import { placeFlatClusters, type PlacedCluster } from './tala/flat-cluster-placement.js';
import { activateFlatClusters } from './tala/cluster-topology.js';
import { placeFlatSequences } from './tala/flat-sequence-placement.js';
import { sequenceDefiningEdges } from './tala/sequence-topology.js';
import { simplifyEdgeRoutes } from './tala/edge-simplify.js';
import { projectContainerEdges } from './tala/container-topology.js';
import { prepareNodeLabels } from './tala/label-policy.js';
import { normalizeLayoutResult } from './tala/normalize.js';
import { alignAxesPass } from './tala/alignment-search.js';
import { ordinaryPlacementEdgeLength } from './tala/placement-edge-length.js';
import { containerAlignmentCost } from './tala/container-alignment-cost.js';
import { normalizeGaps } from './tala/gap-normalization.js';
import { equidistance } from './tala/equidistance.js';
import { transposeLeaves } from './tala/transpose.js';
import { balanceStraightSegments } from './tala/edge-balance.js';
import { balanceSymmetry } from './tala/balance-symmetry.js';
import { directOrdinaryGraph } from './tala/direct.js';
import { combineSubgraphs } from './tala/combine-subgraphs.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode extends RankNode {
  width: number;
  height: number;
  parentId?: string | undefined;
  isGroup?: boolean | undefined;
  labelBBox?: { width: number; height: number } | undefined;
  labelPosition?: string | undefined;
  labelPositionFixed?: boolean | undefined;
  dir?: LayoutDirection | undefined;
  shape?: string | undefined;
  numColumns?: number | undefined;
  aspectRatio1?: boolean | undefined;
  fontSize?: number | undefined;
  fixedTopLeft?: Point | undefined;
  desiredWidth?: number | undefined;
  desiredHeight?: number | undefined;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  fromTableColumnIndex?: number | undefined;
  toTableColumnIndex?: number | undefined;
  minWidth?: number | undefined;
  minHeight?: number | undefined;
  directed?: boolean;
  sourceArrowhead?: string | undefined;
  targetArrowhead?: string | undefined;
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
  const useTala = options.strategy === 'tala'
    || options.strategy !== 'layered' && options.nodeSpacing === undefined
      && options.rankSpacing === undefined && options.orderingPasses === undefined;
  const sourceNodes = useTala
    ? prepareNodeLabels(prescaleNodes(inputNodes, inputEdges)) : inputNodes;
  // Mermaid's parser order is not a placement constraint. Normalize only at
  // the adapter boundary; the TALA graph retains caller order like upstream.
  const graph = TalaGraph.fromFlowchart(
    [...sourceNodes].sort((a, b) => compareText(a.id, b.id)),
    inputEdges,
    options.direction ?? 'TB'
  );
  let selected: LayoutResult | undefined;
  let selectedScore: { penalty: number; area: number } | undefined;
  for (const seed of seeds) {
    const attempt = graph.clone();
    addHubs(attempt);
    const nodes = attempt.toLayoutNodes();
    const edges = attempt.toLayoutEdges();
    const placed = nodes.some((node) => node.isGroup)
      ? layoutCompoundFlowchart(nodes, edges, options, seed)
      : layoutFlatFlowchart(nodes, edges, options, seed);
    const candidate = useTala ? normalizeLayoutResult(placed) : placed;
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
  seed = 1,
  constrainDirection = true,
  endpointReplacements: ReadonlyMap<string, EdgeEndpointReplacements> = new Map(),
  projectedChildren: ReadonlyMap<string, readonly ProjectedChildGeometry[]> = new Map(),
  placedClusters?: PlacedCluster[]
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
  const useOrdinary = options.strategy === 'tala'
    || options.strategy !== 'layered' && options.nodeSpacing === undefined
      && options.rankSpacing === undefined && options.orderingPasses === undefined;
  const allPositions = new Map<string, PositionedNode>();
  const sequenceDefiningEdgeIds = new Set<string>();
  const treeComponents: Array<{ ids: Set<string>; edges: LayoutEdge[]; extraction: TreeExtraction }> = [];
  const componentBounds: Array<ReturnType<typeof bounds>> = [];
  for (const component of components) {
    const hasFixed = component.some((node) => node.fixedTopLeft !== undefined);
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
    const sequencePlacement = useOrdinary && !hasFixed && component.every((node) => !node.isGroup)
      ? placeFlatSequences(component, componentEdges, direction, seed, ranks) : undefined;
    const sequence = sequencePlacement?.nodes;
    for (const id of sequencePlacement?.definingEdgeIds ?? []) sequenceDefiningEdgeIds.add(id);
    const tree = useOrdinary && !sequence && !hasFixed && component.every((node) => !node.isGroup)
      ? placeSimpleTree(component, componentEdges, direction, ranks) : undefined;
    if (tree) treeComponents.push({ ids: componentIds, edges: componentEdges,
      extraction: extractFlatTrees(component, componentEdges) });
    const cluster = useOrdinary && !sequence && !tree && !hasFixed && component.every((node) => !node.isGroup)
      ? placeFlatClusters(component, componentEdges, direction, seed, ranks,
        constrainDirection, placedClusters) : undefined;
    const fixedSingleton = useOrdinary && component.length === 1 && component[0]!.fixedTopLeft
      ? [{ ...component[0]!, x: component[0]!.fixedTopLeft!.x + component[0]!.width / 2,
        y: component[0]!.fixedTopLeft!.y + component[0]!.height / 2,
        rank: 0, order: 0 }] : undefined;
    const localNodes = sequence ?? tree ?? cluster ?? fixedSingleton ?? (useOrdinary && component.length > 1
      ? positionOrdinaryComponent(component, componentEdges, ranks, direction, seed,
        constrainDirection, endpointReplacements, projectedChildren)
      : positionComponent(component, weightedDag, ranks, nodeSpacing, rankSpacing, passes, direction, seed));
    for (const node of localNodes) allPositions.set(node.id, node);
    componentBounds.push(bounds(localNodes));
  }

  // Upstream combines independent subgraphs by testing candidate corners and
  // scoring the area and square deviation of each combined bounding box.
  const alongX = direction === 'TB' || direction === 'BT';
  const fixedBoxes = componentBounds.filter((_, index) => components[index]!
    .some((node) => node.fixedTopLeft !== undefined));
  if (useOrdinary && fixedBoxes.length === 0) {
    combineSubgraphs(components.map((component) => component.map((node) => allPositions.get(node.id)!)));
  } else {
    let componentOffset = fixedBoxes.length === 0 ? 0 : Math.max(0, ...fixedBoxes.map((box) =>
      alongX ? box.minX + box.width : box.minY + box.height)) + (useOrdinary ? 20 : rankSpacing);
    for (let i = 0; i < components.length; i++) {
      const local = components[i]!.map((node) => allPositions.get(node.id)!);
      const box = componentBounds[i]!;
      if (components[i]!.some((node) => node.fixedTopLeft !== undefined)) continue;
      const shift = alongX ? componentOffset - box.minX : componentOffset - box.minY;
      const rankShift = alongX ? -box.minY : -box.minX;
      for (const node of local) {
        if (alongX) { node.x += shift; node.y += rankShift; }
        else { node.y += shift; node.x += rankShift; }
      }
      componentOffset += (alongX ? box.width : box.height) + (useOrdinary ? 20 : rankSpacing);
    }
  }

  const positionedNodes = nodes.map((node) => allPositions.get(node.id)!);
  const treePaths = new Map<string, Point[]>();
  for (const component of treeComponents) {
    const paths = canonicalTreePaths(positionedNodes.filter((node) => component.ids.has(node.id)),
      component.edges, direction, component.extraction);
    if (paths) for (const [edgeId, points] of paths) treePaths.set(edgeId, points);
  }
  const positionedEdges = routeWithConsumedEdges(positionedNodes, edges, direction,
    sequenceDefiningEdgeIds, treePaths);
  return { nodes: positionedNodes, edges: positionedEdges };
}

function positionOrdinaryComponent(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  ranks: ReadonlyMap<string, number>, direction: LayoutDirection, seed: number,
  constrainDirection = true,
  endpointReplacements: ReadonlyMap<string, EdgeEndpointReplacements> = new Map(),
  projectedChildren: ReadonlyMap<string, readonly ProjectedChildGeometry[]> = new Map()): PositionedNode[] {
  const graph = TalaGraph.fromFlowchart(nodes.map((node) => ({ ...node, parentId: undefined })),
    edges, constrainDirection ? direction : undefined);
  for (const edge of edges) {
    const replacements = endpointReplacements.get(edge.id);
    if (replacements) graph.edgeEndpointReplacements.set(edge.id, replacements);
  }
  for (const [id, children] of projectedChildren) graph.projectedChildren.set(id, [...children]);
  placeOrdinaryNodes(graph, seed);
  directOrdinaryGraph(graph, constrainDirection ? direction : undefined);
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
  const edgeById = new Map(inputEdges.map((edge) => [edge.id, edge]));
  if (byId.size !== nodes.length) throw new Error('duplicate node ID');
  for (const node of nodes) {
    if (node.parentId && !byId.get(node.parentId)?.isGroup) throw new Error(`invalid parent for ${node.id}`);
    if (node.parentId === node.id) throw new Error(`cyclic parent for ${node.id}`);
  }
  for (const edge of inputEdges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error(`edge ${edge.id} references a missing node`);
  }
  const projectionGraph = TalaGraph.fromFlowchart(nodes, inputEdges, options.direction ?? 'TB');
  const projectionById = new Map(projectionGraph.nodes.map((node) => [node.id, node]));
  const children = new Map<string | undefined, LayoutNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  interface Scope { width: number; height: number; positioned: PositionedNode[]; clusters: PlacedCluster[] }
  const active = new Set<string>();
  const placeScope = (parentId: string | undefined, direction: LayoutDirection): Scope => {
    if (parentId) {
      if (active.has(parentId)) throw new Error('cyclic container hierarchy');
      active.add(parentId);
    }
    const siblingNodes = children.get(parentId) ?? [];
    if (parentId && siblingNodes.length === 0) {
      const empty = byId.get(parentId)!;
      active.delete(parentId);
      return { width: empty.width, height: empty.height, positioned: [], clusters: [] };
    }
    const nested = new Map<string, Scope>();
    const measured = siblingNodes.map((node) => {
      if (!node.isGroup) return node;
      // Upstream gives an unspecified container no inherited direction.
      // Its ordinary interior placement starts on the horizontal axis; an
      // authored container direction still takes precedence.
      const childScope = placeScope(node.id, node.dir ?? 'LR');
      nested.set(node.id, childScope);
      return { ...node, width: childScope.width, height: childScope.height };
    });
    const projection = projectContainerEdges(projectionGraph,
      parentId ? projectionById.get(parentId)! : null);
    const endpointReplacements = new Map<string, EdgeEndpointReplacements>();
    const projectedChildren = new Map<string, ProjectedChildGeometry[]>();
    for (const [id, scope] of nested) {
      projectedChildren.set(id, scope.positioned.filter((item) => byId.get(item.id)?.parentId === id)
        .map((item) => ({ original: { ...byId.get(item.id)!, width: item.width,
          height: item.height }, offsetX: item.x - item.width / 2 + scope.width / 2,
        offsetY: item.y - item.height / 2 + scope.height / 2 })));
    }
    for (const abduction of projection.abductions) {
      const endpoint = (originalId: string, proxyId: string): EdgeEndpointReplacement | undefined => {
        const scope = nested.get(proxyId);
        const descendant = scope?.positioned.find((item) => item.id === originalId);
        const original = byId.get(originalId);
        if (!scope || !descendant || !original) return;
        return { original: { ...original, width: descendant.width, height: descendant.height }, proxyId,
          offsetX: descendant.x - descendant.width / 2 + scope.width / 2,
          offsetY: descendant.y - descendant.height / 2 + scope.height / 2 };
      };
      const replacements: EdgeEndpointReplacements = {};
      if (abduction.originallyFrom && abduction.currentFrom) {
        const from = endpoint(abduction.originallyFrom.id, abduction.currentFrom.id);
        if (from) replacements.from = from;
      }
      if (abduction.originallyTo && abduction.currentTo) {
        const to = endpoint(abduction.originallyTo.id, abduction.currentTo.id);
        if (to) replacements.to = to;
      }
      if (replacements.from || replacements.to) endpointReplacements.set(abduction.edge.id, replacements);
    }
    const projected: LayoutEdge[] = projection.projected.map((edge) => ({
      ...edgeById.get(edge.id)!, from: edge.from.id, to: edge.to.id,
    }));
    projection.restore();
    // Upstream only records an interior direction when the container declares
    // one. The LR axis below is a presentation fallback for ranks and packing.
    const localClusters: PlacedCluster[] = [];
    const flat = layoutFlatFlowchart(measured, projected, { ...options, direction }, seed,
      parentId === undefined || byId.get(parentId)?.dir !== undefined,
      endpointReplacements, projectedChildren, localClusters);
    const box = bounds(flat.nodes);
    const group = parentId ? byId.get(parentId)! : undefined;
    const padding = 60;
    const topPadding = group ? Math.max(60, (group.labelBBox?.height ?? 0) + 28) : 0;
    const width = group ? Math.max(box.width + 2 * padding,
      group.desiredWidth ?? 0,
      group.labelBBox ? group.labelBBox.width + 2 * padding : 0) : box.width;
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
    return { width, height, positioned,
      clusters: [...nested.values()].flatMap((scope) => scope.clusters).concat(localClusters) };
  };
  const rootScope = placeScope(undefined, options.direction ?? 'TB');
  const placed = rootScope.positioned;
  const useTala = options.strategy === 'tala' || options.strategy !== 'layered'
    && options.nodeSpacing === undefined && options.rankSpacing === undefined
    && options.orderingPasses === undefined;
  if (useTala && !inputEdges.some((edge) => edge.fromTableColumnIndex !== undefined
    || edge.toTableColumnIndex !== undefined)) {
    const alignmentGraph = TalaGraph.fromFlowchart(placed, inputEdges, options.direction ?? 'TB');
    const placedById = new Map(placed.map((node) => [node.id, node]));
    for (const node of alignmentGraph.nodes) {
      const positioned = placedById.get(node.id)!;
      node.topLeft = { x: positioned.x - positioned.width / 2,
        y: positioned.y - positioned.height / 2 };
    }
    const usedIds = new Set(placedById.keys());
    const specifications = rootScope.clusters.map((cluster, index) => {
      let vesselId = `__tala_compound_cluster_${index}`;
      while (usedIds.has(vesselId)) vesselId += '_';
      usedIds.add(vesselId);
      return { ...cluster, vesselId };
    });
    const clustered = specifications.length
      ? activateFlatClusters(alignmentGraph, specifications) : undefined;
    clustered?.clusters.forEach((cluster, index) => {
      const members = specifications[index]!.nodes.map((id) => placedById.get(id)!);
      cluster.vessel.topLeft = {
        x: Math.min(...members.map((node) => node.x - node.width / 2)),
        y: Math.min(...members.map((node) => node.y - node.height / 2)),
      };
      cluster.syncGeometry();
    });
    const alignmentScore = (graph: TalaGraph) => ordinaryPlacementEdgeLength(graph)
      + containerAlignmentCost(graph);
    let changed = false;
    try {
      changed = transposeLeaves(alignmentGraph);
      changed = alignAxesPass(alignmentGraph, alignmentScore) || changed;
      changed = normalizeGaps(alignmentGraph) || changed;
      changed = alignAxesPass(alignmentGraph, alignmentScore) || changed;
      changed = balanceSymmetry(alignmentGraph) || changed;
      changed = equidistance(alignmentGraph) || changed;
      changed = alignAxesPass(alignmentGraph, alignmentScore) || changed;
    } finally {
      clustered?.restore();
    }
    if (changed) {
      const aligned = new Map(alignmentGraph.nodes.map((node) => [node.id, node]));
      for (const node of placed) {
        const current = aligned.get(node.id)!;
        const topLeft = current.topLeft!;
        node.width = current.width;
        node.height = current.height;
        node.x = topLeft.x + node.width / 2;
        node.y = topLeft.y + node.height / 2;
      }
    }
  }
  const consumed = new Set<string>();
  if (useTala) {
    const original = TalaGraph.fromFlowchart(nodes, inputEdges, options.direction ?? 'TB');
    for (const id of sequenceDefiningEdges(original)) consumed.add(id);
  }
  const edges = routeWithConsumedEdges(placed, inputEdges, options.direction ?? 'TB', consumed,
    new Map(), useTala);
  return { nodes: placed, edges };
}

function routeWithConsumedEdges(nodes: readonly PositionedNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, consumed: ReadonlySet<string>,
  canonicalTreePaths: ReadonlyMap<string, Point[]> = new Map(),
  balanceStraight = false): PositionedEdge[] {
  const initialRoutes = routeGraphEdges(nodes, edges.filter((edge) => !consumed.has(edge.id)),
    direction, canonicalTreePaths);
  const beforeById = new Map(initialRoutes.map((edge) => [edge.id, edge]));
  const routed = simplifyEdgeRoutes(nodes, initialRoutes).map((edge) => {
    if (edge.points.length === beforeById.get(edge.id)!.points.length) return edge;
    const point = chooseLabelPoint(edge.points, edge, nodes);
    return { ...edge, x: point.x, y: point.y };
  });
  const hidden = edges.filter((edge) => consumed.has(edge.id)).map((edge) => {
    const { labelBBox: _labelBBox, ...withoutLabel } = edge;
    return { ...withoutLabel, points: [] as Point[], x: 0, y: 0 };
  });
  const balanced = balanceStraight ? balanceStraightSegments(nodes, routed) : routed;
  return [...balanced, ...hidden].sort((a, b) => compareText(a.id, b.id));
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
    if (edge.points.length === 0) continue;
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
