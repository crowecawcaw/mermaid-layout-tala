import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { placementDistance } from './placement-geometry.js';

const precision = 1e-6;

/** Ordinary-node branch of layoutgraph.Nodes.DistanceClustersWithWorkGuard. */
export function distanceClusters(graph: TalaGraph): TalaNode[][] | undefined {
  const threshold = 3 * graph.cellSize;
  const seeded: TalaNode[] = [];
  for (const node of graph.nodes) {
    for (const edge of node.edges) {
      const adjacent = node.adjacent(edge);
      if (placementDistance(node, adjacent, true) > threshold + precision) seeded.push(node, adjacent);
    }
  }
  if (seeded.length < 2) return undefined;

  const assignments = new Map<TalaNode, number>();
  let nextId = 0;
  const mergeNearby = (node: TalaNode): void => {
    for (const other of graph.nodes) {
      if (other === node || other.fixedTopLeft) continue;
      if (placementDistance(node, other, true) > threshold + precision) continue;
      const existing = assignments.get(other);
      if (existing === assignments.get(node)) continue;
      assignments.set(other, assignments.get(node)!);
      if (existing === undefined) mergeNearby(other);
    }
  };
  for (const node of seeded) {
    if (node.fixedTopLeft) continue;
    if (!assignments.has(node)) assignments.set(node, nextId++);
    mergeNearby(node);
  }
  if (graph.nodes.every((node) => !node.fixedTopLeft) && assignments.size !== graph.nodes.length) {
    throw new Error('distance clustering omitted a node');
  }
  const groups = new Map<number, TalaNode[]>();
  for (const [node, id] of assignments) {
    const group = groups.get(id) ?? [];
    group.push(node);
    groups.set(id, group);
  }
  const index = new Map(graph.nodes.map((node, i) => [node, i]));
  return [...groups].sort(([a], [b]) => a - b).map(([, nodes]) =>
    nodes.sort((a, b) => index.get(a)! - index.get(b)!));
}

/** Ordinary-node branch of grouping.JoinDistancedClusters. */
export function joinDistancedClusters(graph: TalaGraph): void {
  if (graph.nodes.length - graph.nodes.filter((node) => node.fixedTopLeft).length <= 1 || graph.edges.length === 0) return;
  const clusters = distanceClusters(graph);
  if (!clusters) return;
  const fixed = graph.nodes.filter((node) => node.fixedTopLeft);
  const target = fixed.length ? center(fixed) : median(clusters.map(center));
  const original = new Map(graph.nodes.map((node) => [node, { ...node.topLeft! }]));
  try {
    for (let iteration = 0; iteration < 1000; iteration++) {
      let moved = false;
      for (const cluster of clusters) {
        const origin = fixed.length ? fixedOrigin(graph, cluster[0]!.parent) : undefined;
        if (inchTowardsTarget(graph, cluster, target, origin)) moved = true;
      }
      if (!moved) break;
    }
  } catch (error) {
    for (const [node, position] of original) node.topLeft = position;
    throw error;
  }
}

function inchTowardsTarget(graph: TalaGraph, cluster: readonly TalaNode[], target: Point,
  origin: Point | undefined): boolean {
  const box = bounds(cluster);
  const current = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  if (Math.hypot(current.x - target.x, current.y - target.y)
    < Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2) return false;
  const dx = Math.sign(target.x - current.x) * graph.cellSize;
  const dy = Math.sign(target.y - current.y) * graph.cellSize;
  if (dx === 0 && dy === 0) return false;

  let overlaps = false, overlapsX = false, overlapsY = false;
  for (const node of cluster) {
    const point = { x: node.topLeft!.x + dx, y: node.topLeft!.y + dy };
    if (!overlaps) {
      if (origin && point.x < origin.x) { overlapsX = true; overlaps = true; }
      if (origin && point.y < origin.y) { overlapsY = true; overlaps = true; }
      if (!overlaps) overlaps = wouldOverlap(graph, node, point, cluster);
    }
    node.topLeft = point;
  }
  if (overlaps) translate(cluster, -dx, -dy);
  if (dx !== 0 && dy !== 0) {
    if (overlapsX && !overlapsY) return attemptAxis(graph, cluster, origin, 0, dy);
    if (!overlapsX && overlapsY) return attemptAxis(graph, cluster, origin, dx, 0);
  }
  return !overlaps;
}

function attemptAxis(graph: TalaGraph, cluster: readonly TalaNode[], origin: Point | undefined,
  dx: number, dy: number): boolean {
  let overlaps = false;
  for (const node of cluster) {
    const point = { x: node.topLeft!.x + dx, y: node.topLeft!.y + dy };
    if (origin && (point.x < origin.x || point.y < origin.y)
      || wouldOverlap(graph, node, point, cluster)) overlaps = true;
    node.topLeft = point;
  }
  if (overlaps) translate(cluster, -dx, -dy);
  return !overlaps;
}

function wouldOverlap(graph: TalaGraph, node: TalaNode, point: Point, except: readonly TalaNode[]): boolean {
  return graph.nodes.some((other) => other !== node && !except.includes(other)
    && other.topLeft && doesOverlapAt(node, other, point));
}

function translate(nodes: readonly TalaNode[], dx: number, dy: number): void {
  for (const node of nodes) node.topLeft = { x: node.topLeft!.x + dx, y: node.topLeft!.y + dy };
}

function bounds(nodes: readonly TalaNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.topLeft!.x);
    minY = Math.min(minY, node.topLeft!.y);
    maxX = Math.max(maxX, goRound(node.topLeft!.x + node.width));
    maxY = Math.max(maxY, goRound(node.topLeft!.y + node.height));
  }
  return { minX, minY, maxX, maxY };
}

function center(nodes: readonly TalaNode[]): Point {
  const box = bounds(nodes);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

function median(points: readonly Point[]): Point {
  const values = (axis: 'x' | 'y') => {
    const sorted = points.map((point) => point[axis]).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle]! + sorted[middle - 1]!) / 2;
  };
  return { x: values('x'), y: values('y') };
}

function fixedOrigin(graph: TalaGraph, parent: TalaNode | null): Point | undefined {
  const fixed = graph.nodes.find((node) => node.parent === parent && node.fixedTopLeft && node.topLeft);
  if (!fixed) return undefined;
  return { x: fixed.topLeft!.x - fixed.fixedTopLeft!.x, y: fixed.topLeft!.y - fixed.fixedTopLeft!.y };
}

function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
