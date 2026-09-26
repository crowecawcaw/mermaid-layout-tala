import type { Point } from '../layout.js';
import { compactionCandidateMoves, inflateAlongAxis, nearestVisibilityPredecessor, visibilityEdges, type CompactionAxis, type VisibilityEdge } from './compaction.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { sizedNodeEdgeLength, sizedTurnCost } from './sized-cost.js';
import { sizelessNodeEdgeLength } from './sizeless-cost.js';
import { nodeSymmetry } from './symmetry.js';

export interface OrdinaryCompactionOptions {
  axis: CompactionAxis;
  includeSizes: boolean;
  factor: number;
  transition?: boolean;
}

/** Ordinary-node branch of placement.compaction, including both search loops. */
export function compactOrdinaryGraph(graph: TalaGraph, options: OrdinaryCompactionOptions): void {
  if (!Number.isFinite(options.factor) || options.factor <= 0) throw new RangeError('compaction factor must be finite and positive');
  if (graph.nodes.some((node) => node.isGroup)) throw new Error('compound compaction is not ported');
  const original = new Map(graph.nodes.map((node) => [node, node.topLeft ? { ...node.topLeft } : undefined]));
  try {
    const visible = visibilityEdges(graph, options.axis, options.includeSizes);
    inflateAlongAxis(graph, options.axis, options.includeSizes, options.factor, visible, !!options.transition);
    if (options.transition) return;
    // Upstream caches this cost at its first use, after inflation.
    const turnCost = options.includeSizes ? sizedTurnCost(graph) * 2 : 0;
    const cost = (node: TalaNode): number => options.includeSizes
      ? sizedNodeEdgeLength(node, graph, turnCost)
      : sizelessNodeEdgeLength(node, graph);
    for (let pass = 0; pass < 20; pass++) {
      if (!shiftVisibilityGroups(graph, options, visible, cost)) break;
    }
    for (let pass = 0; pass < 20; pass++) {
      if (!compactNodes(graph, options, visible, cost)) break;
    }
    for (const node of graph.nodes) if (node.topLeft) {
      if (node.topLeft.x === 0) node.topLeft.x = 0;
      if (node.topLeft.y === 0) node.topLeft.y = 0;
    }
  } catch (error) {
    for (const [node, position] of original) node.topLeft = position ? { ...position } : undefined;
    throw error;
  }
}

function orderedAlongAxis(graph: TalaGraph, axis: CompactionAxis): TalaNode[] {
  return graph.nodes.map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.topLeft![axis] - b.node.topLeft![axis] || a.index - b.index)
    .map(({ node }) => node);
}

function fixedOrigin(graph: TalaGraph, includeSizes: boolean): Point | undefined {
  const fixed = graph.nodes.find((node) => node.fixedTopLeft && node.topLeft);
  if (!fixed) return undefined;
  const x = fixed.topLeft!.x - fixed.fixedTopLeft!.x;
  const y = fixed.topLeft!.y - fixed.fixedTopLeft!.y;
  return includeSizes ? { x, y }
    : { x: goRound(x / graph.cellSize), y: goRound(y / graph.cellSize) };
}

function legalPosition(node: TalaNode, point: Point, others: readonly TalaNode[],
  includeSizes: boolean, origin: Point | undefined): boolean {
  if (origin && (point.x < origin.x || point.y < origin.y)) return false;
  for (const other of others) {
    if (!other.topLeft) continue;
    if (point.x === other.topLeft.x && point.y === other.topLeft.y) return false;
    if (includeSizes && doesOverlapAt(node, other, point)) return false;
  }
  return true;
}

function shiftVisibilityGroups(graph: TalaGraph, options: OrdinaryCompactionOptions,
  visible: readonly VisibilityEdge[], cost: (node: TalaNode) => number): boolean {
  const axis = options.axis, includeSizes = options.includeSizes;
  const groups = new Map<TalaNode, TalaNode[]>();
  let roots: TalaNode[] = [];
  for (const node of orderedAlongAxis(graph, axis)) {
    const predecessor = nearestVisibilityPredecessor(visible, node, axis, includeSizes);
    if (!predecessor) {
      groups.set(node, [node]);
      roots.push(node);
    } else {
      const group = groups.get(predecessor) ?? [];
      group.push(node);
      groups.set(predecessor, group);
    }
  }
  roots = roots.filter((root) => !groups.get(root)!.some((node) => node.fixedTopLeft));
  const index = new Map(graph.nodes.map((node, i) => [node, i]));
  roots.sort((a, b) => a.topLeft![axis] - b.topLeft![axis] || index.get(a)! - index.get(b)!);
  const earliest = graph.nodes.reduce((best, node) => node.topLeft![axis] < best.topLeft![axis] ? node : best);
  const fixed = graph.nodes.filter((node) => node.fixedTopLeft);
  let changed = false;
  for (const root of roots) {
    const group = groups.get(root)!;
    const moves = compactionCandidateMoves(graph, root, axis, includeSizes, options.factor,
      visible, root.topLeft![axis] === earliest.topLeft![axis] ? 2 : 0);
    moves.push({ ...root.topLeft! });
    const remaining = [...fixed, ...graph.nodes.filter((node) => !group.includes(node))];
    const origin = fixedOrigin(graph, includeSizes);
    const symmetryCost = (includeSizes ? graph.cellSize : 1)
      * group.reduce((sum, node) => sum + node.edges.length, 0);
    let bestCost = group.reduce((sum, node) => sum + cost(node), 0);
    let bestDelta = 0;
    const original = group.map((node) => ({ ...node.topLeft! }));
    for (const move of moves) {
      const delta = root.topLeft![axis] - move[axis];
      let overlaps = false;
      for (let i = 0; i < group.length; i++) {
        const node = group[i]!;
        const point = { ...original[i]!, [axis]: original[i]![axis] - delta };
        if (!legalPosition(node, point, remaining, includeSizes, origin)) { overlaps = true; break; }
      }
      if (overlaps) continue;
      group.forEach((node, i) => { node.topLeft = { ...original[i]!, [axis]: original[i]![axis] - delta }; });
      let candidateCost = group.reduce((sum, node) => sum + cost(node), 0);
      if (includeSizes) {
        const symmetry = group.reduce((sum, node) => sum + nodeSymmetry(node, graph), 0);
        candidateCost -= symmetry * symmetryCost;
      }
      group.forEach((node, i) => { node.topLeft = { ...original[i]! }; });
      if (candidateCost < bestCost) { bestCost = candidateCost; bestDelta = delta; }
    }
    if (bestDelta !== 0) {
      changed = true;
      group.forEach((node, i) => { node.topLeft = { ...original[i]!, [axis]: original[i]![axis] - bestDelta }; });
    }
  }
  return changed;
}

function compactNodes(graph: TalaGraph, options: OrdinaryCompactionOptions,
  visible: readonly VisibilityEdge[], cost: (node: TalaNode) => number): boolean {
  let changed = false;
  for (const node of orderedAlongAxis(graph, options.axis)) {
    if (node.fixedTopLeft) continue;
    const moves = compactionCandidateMoves(graph, node, options.axis, options.includeSizes, options.factor, visible);
    moves.push({ ...node.topLeft! });
    if (moveNodeToBest(graph, node, moves, options.includeSizes, cost)) changed = true;
  }
  return changed;
}

function moveNodeToBest(graph: TalaGraph, node: TalaNode, points: readonly Point[],
  includeSizes: boolean, edgeCost: (node: TalaNode) => number): boolean {
  const original = { ...node.topLeft! };
  let best = original, least = Infinity;
  const origin = fixedOrigin(graph, includeSizes);
  for (const point of points) {
    if (origin && (point.x < origin.x || point.y < origin.y)) continue;
    const isOriginal = point.x === original.x && point.y === original.y;
    if (!isOriginal && !legalPosition(node, point, graph.nodes.filter((other) => other !== node), includeSizes, origin)) continue;
    node.topLeft = point;
    const edgeLength = edgeCost(node);
    const score = includeSizes ? edgeLength - nodeSymmetry(node, graph) * graph.cellSize * node.edges.length : edgeLength;
    if (score < least - 1e-6 || (Math.abs(score - least) <= 1e-6 && isOriginal)) {
      least = score;
      best = point;
    }
  }
  if (!Number.isFinite(least)) throw new Error('sizedOptimizer.moveNodeToBest: could not find any placement');
  node.topLeft = { ...best };
  return best.x !== original.x || best.y !== original.y;
}

function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
