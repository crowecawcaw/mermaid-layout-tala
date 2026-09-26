import type { Point } from '../layout.js';
import { GoRandom } from './go-rng.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { closestSizedUnoccupiedDistance, sizedPlacementPoints } from './sized-candidates.js';

const precision = 1e-6;

/** Port of placement.optimizerMedianToNeighbors with IncludeNodeSizes=true for
 * ordinary nodes. The result is expressed in cell units, like upstream. */
export function sizedMedianToNeighbors(node: TalaNode, graph: TalaGraph): Point {
  const neighbors = node.edges.map((edge) => node.adjacent(edge)).filter((other) => other.topLeft);
  if (neighbors.length === 0) throw new Error(`node ${node.id} has no positioned neighbors`);
  const compare = (a: TalaNode, b: TalaNode): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const byX = [...neighbors].sort((a, b) =>
    a.topLeft!.x + a.width / 2 - b.topLeft!.x - b.width / 2 || compare(a, b));
  const byY = [...neighbors].sort((a, b) =>
    a.topLeft!.y + a.height / 2 - b.topLeft!.y - b.height / 2 || compare(a, b));
  const middle = Math.floor(neighbors.length / 2);
  let x = byX[middle]!.topLeft!.x + byX[middle]!.width / 2;
  let y = byY[middle]!.topLeft!.y + byY[middle]!.height / 2;
  if (neighbors.length % 2 === 0) {
    x = (x + byX[middle - 1]!.topLeft!.x + byX[middle - 1]!.width / 2) / 2;
    y = (y + byY[middle - 1]!.topLeft!.y + byY[middle - 1]!.height / 2) / 2;
  }
  return { x: x / graph.cellSize, y: y / graph.cellSize };
}

/** Ordinary-node sized placement control flow. The scorer must include
 * NodeEdgeLength, column crossing, and symmetry terms. Container movement,
 * swap, transpose, and hub escape are separate upstream operations. */
export class SizedOptimizer {
  constructor(private readonly graph: TalaGraph, private readonly random: GoRandom,
    private readonly score: (node: TalaNode) => number) {}

  medianPoint(node: TalaNode, temp: number): Point {
    if (!Number.isFinite(temp) || temp < 0) throw new RangeError('invalid temperature');
    if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
    const cell = this.graph.cellSize;
    const width = node.width / cell, height = node.height / cell;
    const median = sizedMedianToNeighbors(node, this.graph);
    const origin = this.fixedOrigin();
    let x = median.x, y = median.y;
    if (origin) {
      if (x < origin.x / cell) x = origin.x / cell + temp * width;
      if (y < origin.y / cell) y = origin.y / cell + temp * height;
    }
    x += -temp * width + this.random.float64() * (2 * temp * width);
    y += -temp * height + this.random.float64() * (2 * temp * height);
    if (origin) {
      x = Math.max(x, origin.x / cell);
      y = Math.max(y, origin.y / cell);
    }
    return { x: goRound(x * cell), y: goRound(y * cell) };
  }

  optimize(temp: number): boolean {
    const snapshot = new Map(this.graph.nodes.map((node) => [node, node.topLeft ? { ...node.topLeft } : undefined]));
    try {
      let changed = false;
      const indices = this.graph.nodes.map((_, i) => i);
      this.random.shuffle(indices);
      const origin = this.fixedOrigin();
      for (const index of indices) {
        const node = this.graph.nodes[index]!;
        if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
        if (node.fixedTopLeft || node.edges.length === 0) continue;
        if (node.width > 100 * this.graph.cellSize || node.height > 100 * this.graph.cellSize) continue;
        const median = this.medianPoint(node, temp);
        const distance = closestSizedUnoccupiedDistance(this.graph, node, median, true, origin);
        const points = sizedPlacementPoints(this.graph, node, median, distance, true, origin);
        this.random.shuffle(points);
        if (this.moveNodeToBest(node, points, temp === 0, origin)) changed = true;
      }
      return changed;
    } catch (error) {
      for (const [node, position] of snapshot) node.topLeft = position ? { ...position } : undefined;
      throw error;
    }
  }

  /** Ordinary-node branch of sizedOptimizer.moveNodeToBest. */
  moveNodeToBest(node: TalaNode, points: readonly Point[], mustImprove: boolean,
    fixedOrigin = this.fixedOrigin()): boolean {
    if (!node.topLeft) throw new Error(`node ${node.id} is unpositioned`);
    const original = { ...node.topLeft };
    let leastCost = mustImprove ? this.score(node) : Infinity;
    let best = original;
    try {
      for (const point of points) {
        if (fixedOrigin && (point.x < fixedOrigin.x || point.y < fixedOrigin.y)) continue;
        const isOriginal = point.x === original.x && point.y === original.y;
        if (!isOriginal && !this.canMove(node, point)) continue;
        node.topLeft = point;
        const cost = this.score(node);
        if (!Number.isFinite(cost)) throw new Error('non-finite sized placement cost');
        if (cost < leastCost - precision || (Math.abs(cost - leastCost) <= precision && isOriginal)) {
          leastCost = cost;
          best = point;
        }
      }
      if (!Number.isFinite(leastCost)) throw new Error('could not find a sized placement');
      node.topLeft = best;
      return best.x !== original.x || best.y !== original.y;
    } catch (error) {
      node.topLeft = original;
      throw error;
    }
  }

  private canMove(node: TalaNode, point: Point): boolean {
    for (const other of this.graph.nodes) {
      if (other === node || !other.topLeft) continue;
      if (point.x === other.topLeft.x && point.y === other.topLeft.y) return false;
      if (doesOverlapAt(node, other, point)) return false;
    }
    return true;
  }

  private fixedOrigin(): Point | undefined {
    const fixed = this.graph.nodes.find((node) => node.fixedTopLeft && node.topLeft);
    if (!fixed) return undefined;
    return {
      x: fixed.topLeft!.x - fixed.fixedTopLeft!.x,
      y: fixed.topLeft!.y - fixed.fixedTopLeft!.y,
    };
  }
}

function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
