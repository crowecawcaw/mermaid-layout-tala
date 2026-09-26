import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { ConnectedNodeGap } from './geometry-policy.js';
import { nodeDelta } from './overlap.js';

export type CompactionAxis = 'x' | 'y';
export interface VisibilityEdge { from: TalaNode; to: TalaNode }

/** Ordinary-node branch of placement.visibilityEdges. */
export function visibilityEdges(graph: TalaGraph, axis: CompactionAxis, includeSizes: boolean): VisibilityEdge[] {
  const horizontal = axis === 'x';
  const result: VisibilityEdge[] = [];
  for (const first of graph.nodes) {
    if (!first.topLeft) throw new Error(`node ${first.id} is unpositioned`);
    for (const second of graph.nodes) {
      if (first === second) continue;
      if (!second.topLeft) throw new Error(`node ${second.id} is unpositioned`);
      const padding = nodeDelta(first, second);
      if (!visibilityCandidate(first, second, horizontal, includeSizes, padding)) continue;
      if (!graph.nodes.some((blocker) => blocker !== first && blocker !== second
        && visibilityBlocked(blocker, first, second, horizontal, includeSizes))) {
        result.push({ from: first, to: second });
      }
    }
  }
  return result;
}

function visibilityCandidate(first: TalaNode, second: TalaNode,
  horizontal: boolean, includeSizes: boolean, padding: number): boolean {
  const a = first.topLeft!, b = second.topLeft!;
  if (horizontal) {
    if (a.x >= b.x) return false;
    return includeSizes
      ? a.y <= b.y + second.height + padding && a.y + first.height + padding >= b.y
      : a.y === b.y;
  }
  if (a.y >= b.y) return false;
  return includeSizes
    ? a.x <= b.x + second.width + padding && a.x + first.width + padding >= b.x
    : a.x === b.x;
}

function visibilityBlocked(blocker: TalaNode, first: TalaNode, second: TalaNode,
  horizontal: boolean, includeSizes: boolean): boolean {
  const p = blocker.topLeft;
  if (!p) return false;
  const a = first.topLeft!, b = second.topLeft!;
  if (horizontal) {
    if (includeSizes) {
      if (!(p.x >= a.x + first.width && p.x + blocker.width <= b.x)) return false;
      return p.y <= Math.max(a.y, b.y)
        && p.y + blocker.height >= Math.min(a.y + first.height, b.y + second.height);
    }
    return p.x >= a.x && p.x <= b.x && p.y <= Math.max(a.y, b.y) && p.y >= Math.min(a.y, b.y);
  }
  if (includeSizes) {
    if (!(p.y >= a.y + first.height && p.y + blocker.height <= b.y)) return false;
    return p.x <= Math.max(a.x, b.x)
      && p.x + blocker.width >= Math.min(a.x + first.width, b.x + second.width);
  }
  return p.y >= a.y && p.y <= b.y && p.x <= Math.max(a.x, b.x) && p.x >= Math.min(a.x, b.x);
}

export function nearestVisibilityPredecessor(edges: readonly VisibilityEdge[], node: TalaNode,
  axis: CompactionAxis, includeSizes: boolean): TalaNode | undefined {
  let nearest: TalaNode | undefined;
  let furthest = -Infinity;
  for (const edge of edges) {
    if (edge.to !== node) continue;
    const position = edge.from.topLeft![axis] + (includeSizes ? axisSize(edge.from, axis) : 0);
    if (position > furthest) { furthest = position; nearest = edge.from; }
  }
  return nearest;
}

/** Port of placement.compactionFloor. Sized floors are cell indices. */
export function compactionFloor(graph: TalaGraph, anchor: TalaNode, factor: number,
  axis: CompactionAxis, includeSizes: boolean, padding: number): number {
  const start = anchor.topLeft![axis];
  let floor = includeSizes
    ? Math.ceil((start + factor * axisSize(anchor, axis)) / graph.cellSize)
    : start + Math.floor(factor);
  if (includeSizes) {
    const end = start + axisSize(anchor, axis);
    while (floor * graph.cellSize - end <= padding) floor++;
  }
  return floor;
}

/** Port of placement.candidateMoves for ordinary nodes. */
export function compactionCandidateMoves(graph: TalaGraph, node: TalaNode,
  axis: CompactionAxis, includeSizes: boolean, factor: number,
  edges: readonly VisibilityEdge[], floorDecrease = 0): Point[] {
  if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
  const ordered = graph.nodes;
  if (ordered.length === 0) return [];
  const earliest = ordered.reduce((best, other) => other.topLeft![axis] < best.topLeft![axis] ? other : best);
  const nearest = nearestVisibilityPredecessor(edges, node, axis, includeSizes) ?? earliest;
  let floor = compactionFloor(graph, nearest, factor, axis, includeSizes, nodeDelta(node, nearest));
  const cross: CompactionAxis = axis === 'x' ? 'y' : 'x';
  const separated = includeSizes
    ? nearest.topLeft![cross] > node.topLeft[cross] + axisSize(node, cross)
      || nearest.topLeft![cross] + axisSize(nearest, cross) < node.topLeft[cross]
    : nearest.topLeft![cross] !== node.topLeft[cross];
  if (nearest.topLeft![axis] === node.topLeft[axis] || separated) {
    floor = includeSizes ? nearest.topLeft![axis] / graph.cellSize : nearest.topLeft![axis];
    if (includeSizes && graph.nodes.some((candidate) => candidate.fixedTopLeft)) floor = goRound(floor);
  }
  const ceil = includeSizes ? node.topLeft[axis] / graph.cellSize : node.topLeft[axis];
  const start = floor - floorDecrease;
  if (!Number.isFinite(start) || !Number.isFinite(ceil)) throw new Error('compaction candidate range is not finite');
  if (start <= ceil && Math.floor(ceil - start) + 1 > 30003) throw new Error('compaction candidate limit exceeded');
  const points: Point[] = [];
  for (let coordinate = start; coordinate <= ceil; coordinate++) {
    const value = includeSizes ? coordinate * graph.cellSize : coordinate;
    points.push(axis === 'x' ? { x: value, y: node.topLeft.y } : { x: node.topLeft.x, y: value });
  }
  return points;
}

/** Port of the inflation part of placement.compaction for ordinary nodes. */
export function inflateAlongAxis(graph: TalaGraph, axis: CompactionAxis,
  includeSizes: boolean, factor: number, edges: readonly VisibilityEdge[], transition: boolean): void {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('compaction factor must be finite and positive');
  const order = graph.nodes.map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.topLeft![axis] - b.node.topLeft![axis] || a.index - b.index)
    .map(({ node }) => node);
  const hasFixed = graph.nodes.some((node) => node.fixedTopLeft);
  for (const node of order) {
    if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
    const nearest = nearestVisibilityPredecessor(edges, node, axis, includeSizes);
    if (!nearest) {
      if (hasFixed && transition && !node.fixedTopLeft) {
        node.topLeft = { ...node.topLeft,
          [axis]: Math.floor(node.topLeft[axis] / graph.cellSize) * graph.cellSize };
      }
      continue;
    }
    if (node.fixedTopLeft && !transition) continue;
    const padding = transition ? ConnectedNodeGap : nodeDelta(node, nearest);
    const floor = compactionFloor(graph, nearest, factor, axis, includeSizes, padding);
    const value = includeSizes ? floor * graph.cellSize : floor;
    if (value > node.topLeft[axis]) node.topLeft = { ...node.topLeft, [axis]: value };
  }
}

function axisSize(node: TalaNode, axis: CompactionAxis): number {
  return axis === 'x' ? node.width : node.height;
}

function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
