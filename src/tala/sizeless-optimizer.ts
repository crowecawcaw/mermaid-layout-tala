import type { Point } from '../layout.js';
import { GoRandom } from './go-rng.js';
import { TalaGraph, TalaNode } from './graph.js';
import { sizelessNodeEdgeLength } from './sizeless-cost.js';

const positionKey = (point: Point): string => `${point.x},${point.y}`;

/** Port of placement.medianToNeighbors for the non-sized phase. */
export function medianToNeighbors(node: TalaNode): Point {
  const neighbors = node.edges.map((edge) => node.adjacent(edge)).filter((adjacent) => adjacent.topLeft);
  if (neighbors.length === 0) throw new Error(`node ${node.id} has no positioned neighbors`);
  const byX = [...neighbors].sort((a, b) => a.topLeft!.x - b.topLeft!.x || compareId(a, b));
  const byY = [...neighbors].sort((a, b) => a.topLeft!.y - b.topLeft!.y || compareId(a, b));
  const middle = Math.floor(neighbors.length / 2);
  let x = byX[middle]!.topLeft!.x + 0.5;
  let y = byY[middle]!.topLeft!.y + 0.5;
  if (neighbors.length % 2 === 0) {
    x = (x + byX[middle - 1]!.topLeft!.x) / 2;
    y = (y + byY[middle - 1]!.topLeft!.y) / 2;
  }
  return { x, y };
}

/** Search the Manhattan rings in upstream's exact point order. */
export function closestUnoccupiedDistance(median: Point, occupied: ReadonlySet<string>): number {
  for (let distance = 0; distance <= 100; distance++) {
    let y = 0;
    for (let x = distance; x >= -distance; x--) {
      if (y !== 0 && !occupied.has(positionKey({ x: median.x + x, y: median.y - y }))) return distance;
      if (!occupied.has(positionKey({ x: median.x + x, y: median.y + y }))) return distance;
      if (x > 0) y++;
      else y--;
    }
  }
  throw new Error('no unoccupied position within 100 cells');
}

/** Port of sizelessOptimizer.placementPoints (all cells through d + 1). */
export function placementPoints(median: Point, minUnoccupiedDistance: number, occupied: ReadonlySet<string>): Point[] {
  if (!Number.isInteger(minUnoccupiedDistance) || minUnoccupiedDistance < 0 || minUnoccupiedDistance > 100) {
    throw new RangeError('placement distance must be an integer in [0, 100]');
  }
  const distance = minUnoccupiedDistance + 1;
  const points: Point[] = [];
  for (let x = distance; x >= -distance; x--) {
    for (let y = 0; y <= distance - Math.abs(x); y++) {
      if (y !== 0) {
        const point = { x: median.x + x, y: median.y - y };
        if (!occupied.has(positionKey(point))) points.push(point);
      }
      const point = { x: median.x + x, y: median.y + y };
      if (!occupied.has(positionKey(point))) points.push(point);
    }
  }
  return points;
}

/** The upstream ordinary-node sizeless loop. Callers may inject a scorer for
 * differential tests; the default uses the ported edge cost. */
export class SizelessOptimizer {
  private readonly occupied = new Map<string, TalaNode>();
  private readonly movable: TalaNode[];
  private readonly score: (node: TalaNode) => number;

  constructor(private readonly graph: TalaGraph, private readonly random: GoRandom,
    score?: (node: TalaNode) => number) {
    this.score = score ?? ((node) => sizelessNodeEdgeLength(node, graph));
    this.movable = graph.nodes.filter((node) => node.edges.length > 0 && !node.fixedTopLeft);
    this.resetOccupied();
  }

  resetOccupied(): void {
    this.occupied.clear();
    for (const node of this.graph.nodes) if (node.topLeft) this.occupied.set(positionKey(node.topLeft), node);
  }

  optimize(temp: number): void {
    if (!Number.isFinite(temp) || temp < 0) throw new RangeError('invalid temperature');
    const snapshot = new Map(this.graph.nodes.map((node) => [node, node.topLeft ? { ...node.topLeft } : undefined]));
    try {
      this.optimizePass(temp);
    } catch (error) {
      for (const [node, position] of snapshot) node.topLeft = position ? { ...position } : undefined;
      this.resetOccupied();
      throw error;
    }
  }

  private optimizePass(temp: number): void {
    const indices = this.movable.map((_, index) => index);
    this.random.shuffle(indices);
    for (const index of indices) {
      const node = this.movable[index]!;
      if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
      const original = { ...node.topLeft };
      this.occupied.delete(positionKey(original));
      try {
        const median = medianToNeighbors(node);
        const center = {
          x: goRound(median.x - temp + this.random.float64() * 2 * temp),
          y: goRound(median.y - temp + this.random.float64() * 2 * temp),
        };
        const occupied = new Set(this.occupied.keys());
        const distance = closestUnoccupiedDistance(center, occupied);
        const points = placementPoints(center, distance, occupied);
        this.random.shuffle(points);
        let best = original;
        let bestCost = Infinity;
        for (const point of points) {
          node.topLeft = point;
          const cost = this.score(node);
          if (!Number.isFinite(cost)) throw new Error('non-finite placement cost');
          if (cost < bestCost - 1e-6 || (Math.abs(cost - bestCost) <= 1e-6
            && point.x === original.x && point.y === original.y)) {
            best = point;
            bestCost = cost;
          }
        }
        node.topLeft = best;
        if (best.x === original.x && best.y === original.y) this.swapIfBetter(node);
      } catch (error) {
        node.topLeft = original;
        throw error;
      } finally {
        this.occupied.set(positionKey(node.topLeft!), node);
      }
    }
  }

  private swapIfBetter(node: TalaNode): void {
    const original = node.topLeft!;
    let bestCost = this.score(node);
    let best: TalaNode | undefined;
    const candidates = [
      { x: original.x, y: original.y - 1 }, { x: original.x, y: original.y + 1 },
      { x: original.x - 1, y: original.y }, { x: original.x + 1, y: original.y },
    ].map((point) => this.occupied.get(positionKey(point))).filter((candidate): candidate is TalaNode => !!candidate);
    this.random.shuffle(candidates);
    for (const candidate of candidates) {
      const candidatePosition = candidate.topLeft!;
      const candidateCost = this.score(candidate);
      let swappedNodeCost: number;
      let swappedCandidateCost: number;
      try {
        node.topLeft = candidatePosition;
        candidate.topLeft = original;
        swappedNodeCost = this.score(node);
        swappedCandidateCost = swappedNodeCost < bestCost - 1e-6 ? this.score(candidate) : Infinity;
      } finally {
        node.topLeft = original;
        candidate.topLeft = candidatePosition;
      }
      if (swappedNodeCost < bestCost - 1e-6 && swappedCandidateCost <= candidateCost + 1e-6) {
        bestCost = swappedNodeCost;
        best = candidate;
      }
    }
    if (best) {
      const point = best.topLeft!;
      best.topLeft = original;
      node.topLeft = point;
      this.occupied.set(positionKey(original), best);
    }
  }
}

function compareId(first: TalaNode, second: TalaNode): number {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

function goRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
