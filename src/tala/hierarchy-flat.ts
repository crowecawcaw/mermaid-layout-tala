import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode, Point } from '../layout.js';
import { rankDag } from '../rank.js';
import { GoRandom } from './go-rng.js';
import { alignFlatHierarchy } from './hierarchy-align.js';

/** Flat, directed part of upstream hierarchy discovery and placement. */
export interface HierarchyVertex {
  node: LayoutNode;
  level: number;
  rank: number;
  width: number;
  height: number;
  topLeft: Point;
  aboves: Set<HierarchyVertex>;
  belows: Set<HierarchyVertex>;
  dummy: boolean;
}

interface Segment { start: Point; end: Point }
const crossingSpacing = 50;
const parentSpacing = 300;
const siblingSpacing = 60;
const minPortClearance = 20;

/** Return levels only when upstream's ordinary automatic hierarchy rules
 * admit an entire flat, directed DAG component. */
export function discoverFlatHierarchy(nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[], direction: LayoutDirection): Map<string, number> | undefined {
  if (nodes.length < 3 || nodes.some((node) => node.isGroup || node.fixedTopLeft
    || node.shape?.toLowerCase() === 'table')) return undefined;
  const structural = edges.filter((edge) => edge.from !== edge.to);
  if (structural.length === 0 || structural.some((edge) => edge.directed === false
    || edge.sourceArrowhead && edge.sourceArrowhead !== 'none'
    || edge.targetArrowhead === 'none')) return undefined;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, 0]));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of structural) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) return undefined;
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
    outgoing.set(edge.from, outgoing.get(edge.from)! + 1);
    degree.set(edge.from, degree.get(edge.from)! + 1);
    degree.set(edge.to, degree.get(edge.to)! + 1);
  }
  const sources = nodes.filter((node) => incoming.get(node.id) === 0);
  const sinks = nodes.filter((node) => outgoing.get(node.id) === 0 && incoming.get(node.id)! > 0);
  if (sources.length === 0 || sinks.length === 0) return undefined;
  let levels: Map<string, number>;
  try {
    levels = rankDag(nodes, structural.map((edge) => ({ id: edge.id,
      from: edge.from, to: edge.to })));
  } catch {
    return undefined; // Cycle reversal is a later hierarchy port step.
  }
  const levelCount = Math.max(...levels.values()) + 1;
  if (levelCount < 3) return undefined;
  const aspect = nodes.length / (levelCount * levelCount);
  const tooTall = aspect < 0.5, tooWide = aspect > 2;
  let branchedWorkflow = nodes.length > levelCount && sources.length === 1
    && sinks.length === 1 && nodes.length <= 128 && structural.length <= 256;
  if (tooTall && branchedWorkflow) {
    const horizontal = direction === 'LR' || direction === 'RL';
    const sizes = Array.from({ length: levelCount }, () => 0);
    for (const node of nodes) {
      const level = levels.get(node.id)!;
      sizes[level] = Math.max(sizes[level]!, horizontal ? node.width : node.height);
    }
    const extent = (levelCount - 1) * (crossingSpacing + 2 * minPortClearance)
      + sizes.reduce((sum, size) => sum + Math.ceil(size), 0);
    branchedWorkflow = extent <= 30_000;
  }
  const maxEdges = 2 * Math.ceil(Math.sqrt(nodes.length));
  if (tooWide || tooTall && !branchedWorkflow
    || [...degree.values()].some((value) => value > maxEdges)
    || isOneManyOne(nodes, structural, levels, levelCount)) return undefined;
  return levels;
}

function isOneManyOne(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  levels: ReadonlyMap<string, number>, levelCount: number): boolean {
  if (levelCount !== 3) return false;
  const rows = Array.from({ length: 3 }, () => [] as LayoutNode[]);
  for (const node of nodes) rows[levels.get(node.id)!]!.push(node);
  if (rows[0]!.length !== 1 || rows[2]!.length !== 1) return false;
  const source = rows[0]![0]!.id, sink = rows[2]![0]!.id;
  if (edges.some((edge) => edge.from === source && edge.to === sink)) return false;
  return rows[1]!.every((node) => edges.some((edge) => edge.from === source && edge.to === node.id)
    && edges.some((edge) => edge.from === node.id && edge.to === sink));
}

/** The flat branches of hierarchy.Place: seeded ordering, crossings, sifting,
 * level spacing, and four-direction Brandes-Kopf alignment. */
export function placeFlatHierarchy(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  levels: ReadonlyMap<string, number>, direction: LayoutDirection, seed: number): PositionedNode[] {
  const horizontal = direction === 'LR' || direction === 'RL';
  const vertices: HierarchyVertex[] = hierarchyComponentOrder(nodes, edges).map((node) => ({
    node, level: levels.get(node.id)!, rank: 0,
    width: horizontal ? node.height : node.width,
    height: horizontal ? node.width : node.height,
    topLeft: { x: 0, y: 0 }, aboves: new Set(), belows: new Set(), dummy: false,
  }));
  new GoRandom(seed).shuffle(vertices);
  const byId = new Map(vertices.map((vertex) => [vertex.node.id, vertex]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    let above = byId.get(edge.from)!, below = byId.get(edge.to)!;
    if (above.level > below.level) [above, below] = [below, above];
    if (above.level === below.level) continue;
    above.belows.add(below);
    below.aboves.add(above);
  }
  const levelCount = Math.max(...levels.values()) + 1;
  const byLevel = Array.from({ length: levelCount }, () => [] as HierarchyVertex[]);
  for (const vertex of vertices) byLevel[vertex.level]!.push(vertex);
  byLevel.forEach(rankLevel);
  breakLongConnections(vertices, byLevel);
  minimizeHierarchyCrossings(byLevel);
  globalSifting(byLevel);
  placeNodesByLevel(byLevel, horizontal, edges);
  byLevel.forEach(rankLevel);
  alignFlatHierarchy(byLevel);
  return nodes.map((node) => {
    const vertex = byId.get(node.id)!;
    let topLeft = vertex.topLeft;
    if (horizontal) topLeft = { x: topLeft.y, y: topLeft.x };
    if (direction === 'BT') topLeft = { ...topLeft, y: -topLeft.y - node.height };
    if (direction === 'RL') topLeft = { ...topLeft, x: -topLeft.x - node.width };
    return { ...node, x: topLeft.x + node.width / 2,
      y: topLeft.y + node.height / 2, rank: vertex.level, order: vertex.rank };
  });
}

/** SplitSubgraphs visits each component in BFS order, following the input edge
 * order at each node. Hierarchy placement shuffles that ordered slice. */
function hierarchyComponentOrder(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacent = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!adjacent.has(edge.from) || !adjacent.has(edge.to)) continue;
    adjacent.get(edge.from)!.push(edge.to);
    if (edge.from !== edge.to) adjacent.get(edge.to)!.push(edge.from);
  }
  const result: LayoutNode[] = [], seen = new Set<string>();
  for (const start of nodes) {
    if (seen.has(start.id)) continue;
    const queue = [start.id];
    seen.add(start.id);
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head]!;
      result.push(byId.get(id)!);
      for (const neighbor of adjacent.get(id)!) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}

function rankLevel(level: HierarchyVertex[]): void {
  level.forEach((node, index) => { node.rank = index; });
}

function breakLongConnections(nodes: readonly HierarchyVertex[],
  byLevel: HierarchyVertex[][]): void {
  let dummyId = 0;
  for (const node of nodes) {
    const long = [...node.belows].filter((below) => below.level - node.level > 1)
      .sort((a, b) => a.rank - b.rank || a.level - b.level);
    for (const below of long) {
      node.belows.delete(below);
      below.aboves.delete(node);
      let above = node;
      for (let level = node.level + 1; level < below.level; level++) {
        const dummy: HierarchyVertex = { node: { id: `__hierarchy_dummy_${++dummyId}`,
          width: 1, height: 1 }, level, rank: byLevel[level]!.length,
          width: 1, height: 1, topLeft: { x: 0, y: 0 },
          aboves: new Set([above]), belows: new Set(), dummy: true };
        above.belows.add(dummy);
        byLevel[level]!.push(dummy);
        above = dummy;
      }
      above.belows.add(below);
      below.aboves.add(above);
    }
  }
}

function segments(nodes: readonly HierarchyVertex[], aboves: boolean, belows: boolean): Segment[] {
  const result: Segment[] = [];
  for (const node of nodes) {
    for (const neighbor of aboves ? node.aboves : []) {
      result.push({ start: { x: node.rank, y: node.level },
        end: { x: neighbor.rank, y: neighbor.level } });
    }
    for (const neighbor of belows ? node.belows : []) {
      result.push({ start: { x: node.rank, y: node.level },
        end: { x: neighbor.rank, y: neighbor.level } });
    }
  }
  return result.sort((a, b) => a.start.x - b.start.x || a.end.x - b.end.x);
}

function score(nodes: readonly HierarchyVertex[], aboves = true, belows = true):
  { crossings: number; length: number } {
  const lines = segments(nodes, aboves, belows);
  let crossings = 0, length = 0;
  for (const line of lines) length += Math.hypot(line.end.x - line.start.x,
    line.end.y - line.start.y);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i]!, b = lines[j]!;
    if (a.start.x === b.start.x && a.start.y === b.start.y
      || a.end.x === b.end.x && a.end.y === b.end.y) continue;
    const den = (a.end.y-a.start.y)*(b.end.x-b.start.x)
      - (a.end.x-a.start.x)*(b.end.y-b.start.y);
    if (den === 0) continue;
    const s = ((b.end.x-b.start.x)*(b.start.y-a.start.y)
      - (b.end.y-b.start.y)*(b.start.x-a.start.x))/den;
    const t = ((a.end.x-a.start.x)*(b.start.y-a.start.y)
      - (a.end.y-a.start.y)*(b.start.x-a.start.x))/den;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) crossings++;
  }
  return { crossings, length };
}

function better(a: ReturnType<typeof score>, b: ReturnType<typeof score>): boolean {
  return a.crossings < b.crossings
    || a.crossings === b.crossings && a.length < b.length - 0.0001;
}

function minimizeHierarchyCrossings(byLevel: HierarchyVertex[][]): void {
  const iterations = Math.max(...byLevel.map((level) => level.length));
  for (let pass = 0; pass < iterations; pass++) for (let levelIndex = 0;
    levelIndex < byLevel.length; levelIndex++) {
    const row = byLevel[levelIndex]!;
    if (row.length === 0) continue;
    const useAbove = levelIndex > 0;
    row.sort((a, b) => averageRank(a, useAbove) - averageRank(b, useAbove));
    rankLevel(row);
    let current = score(row);
    for (let index = 0; index < row.length; index++) {
      let bestIndex = 0, best = { crossings: Infinity, length: Infinity };
      for (let trial = index + 1; trial < index + 4; trial++) {
        const j = trial % row.length;
        [row[index], row[j]] = [row[j]!, row[index]!];
        rankLevel(row);
        const candidate = score(row);
        if (better(candidate, best)) { best = candidate; bestIndex = j; }
        [row[index], row[j]] = [row[j]!, row[index]!];
      }
      if (better(best, current)) {
        [row[index], row[bestIndex]] = [row[bestIndex]!, row[index]!];
        current = best;
      }
      rankLevel(row);
    }
  }
}

function averageRank(node: HierarchyVertex, above: boolean): number {
  const neighbors = above ? node.aboves : node.belows;
  if (neighbors.size === 0) return 0;
  return [...neighbors].reduce((sum, neighbor) => sum + neighbor.rank, 0) / neighbors.size;
}

function globalSifting(byLevel: HierarchyVertex[][]): void {
  const queue = byLevel.flat().sort((a, b) =>
    b.aboves.size + b.belows.size - a.aboves.size - a.belows.size
    || a.level - b.level || a.rank - b.rank);
  let improveIfEqual = false;
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (const node of queue) {
      const siblings = byLevel[node.level]!;
      const previous = node.rank;
      sift(node, siblings, improveIfEqual);
      if (node.rank !== previous) improved = true;
    }
    if (!improved) {
      if (improveIfEqual) break;
      improveIfEqual = true;
    } else improveIfEqual = false;
  }
}

function sift(node: HierarchyVertex, row: HierarchyVertex[], improveIfEqual: boolean): void {
  let best = score(row), bestIndex = -1;
  if (best.crossings === 0 || row.length === 1) return;
  if (node === row.at(-1)) bestIndex = row.length - 1;
  else for (let i = 0; i < row.length - 1; i++) {
    if (bestIndex === -1) {
      if (row[i] === node) bestIndex = i;
      else continue;
    }
    [row[i], row[i + 1]] = [row[i + 1]!, row[i]!];
    rankLevel(row);
    const trial = score(row);
    if (improved(trial, best, improveIfEqual)) { best = trial; bestIndex = i + 1; }
  }
  for (let i = row.length - 1; i > 0; i--) {
    [row[i - 1], row[i]] = [row[i]!, row[i - 1]!];
    rankLevel(row);
    const trial = score(row);
    if (improved(trial, best, improveIfEqual)) { best = trial; bestIndex = i - 1; }
  }
  for (let i = 0; i < bestIndex; i++) {
    [row[i], row[i + 1]] = [row[i + 1]!, row[i]!];
  }
  rankLevel(row);
}

function improved(candidate: ReturnType<typeof score>, current: ReturnType<typeof score>,
  includeEqual: boolean): boolean {
  if (includeEqual) return candidate.crossings <= current.crossings;
  return candidate.crossings < current.crossings
    || candidate.crossings === current.crossings && candidate.length < current.length - 1e-6;
}

function placeNodesByLevel(byLevel: HierarchyVertex[][], horizontal: boolean,
  edges: readonly LayoutEdge[]): void {
  let y = 0;
  const edgesByFrom = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const list = edgesByFrom.get(edge.from) ?? [];
    list.push(edge); edgesByFrom.set(edge.from, list);
  }
  for (const [level, row] of byLevel.entries()) {
    let x = 0, maxHeight = 0;
    for (const node of row) {
      node.topLeft = { x, y };
      if (!node.dummy) {
        maxHeight = Math.max(maxHeight, node.height);
        x += Math.ceil(node.width) + siblingSpacing;
      } else x += siblingSpacing;
    }
    const next = byLevel[level + 1] ?? [];
    const crossings = score(row, false, true).crossings;
    let labelSize = 0;
    for (const node of row) for (const edge of edgesByFrom.get(node.node.id) ?? []) {
      if (next.some((candidate) => candidate.node.id === edge.to) && edge.labelBBox) {
        labelSize = Math.max(labelSize, horizontal ? edge.labelBBox.width : edge.labelBBox.height);
      }
    }
    const spacing = Math.min(parentSpacing,
      Math.max(crossingSpacing, crossings * crossingSpacing, labelSize + crossingSpacing));
    y += Math.ceil(maxHeight + Math.round(spacing) + 2 * minPortClearance);
    const center = (Math.min(...row.map((node) => node.topLeft.y))
      + Math.max(...row.map((node) => node.topLeft.y + node.height))) / 2;
    for (const node of row) node.topLeft.y += Math.ceil(Math.ceil(center) - (node.topLeft.y + node.height / 2));
  }
}
