import type { Point } from '../layout.js';
import { GoRandom } from './go-rng.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { distanceBetweenBoxes, sizedOrientation } from './placement-geometry.js';
import { closestSizedUnoccupiedDistance, sizedPlacementPoints } from './sized-candidates.js';
import { sizedNodeEdgeLength } from './sized-cost.js';
import { nodeSymmetry } from './symmetry.js';

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

/** Ordinary-node sized placement control flow, including spatial swaps and
 * quarter-turn transposes. Compound movement and hub escape remain separate. */
export class SizedOptimizer {
  private readonly score: (node: TalaNode) => number;

  constructor(private readonly graph: TalaGraph, private readonly random: GoRandom,
    score?: (node: TalaNode) => number) {
    const turnCost = graph.turnCost();
    this.score = score ?? ((node) => sizedNodeEdgeLength(node, graph, turnCost)
      - nodeSymmetry(node, graph) * graph.cellSize * node.edges.length);
  }

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
        const moved = this.moveNodeToBest(node, points, temp === 0, origin);
        if (moved) changed = true;
        else {
          const swap = this.bestSwapCandidate(node);
          if (swap) {
            const old = node.topLeft;
            node.topLeft = swap.topLeft;
            swap.topLeft = old;
            changed = true;
          } else if (this.transpose(node)) changed = true;
        }
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

  /** Ordinary branch of bestSwapCandidateGuarded. Upstream shuffles every node
   * before filtering for spatial adjacency, which also advances the RNG. */
  private bestSwapCandidate(node: TalaNode): TalaNode | undefined {
    const current = this.score(node);
    let least = Infinity;
    let best: TalaNode | undefined;
    const indices = this.graph.nodes.map((_, i) => i);
    this.random.shuffle(indices);
    for (const index of indices) {
      const other = this.graph.nodes[index]!;
      if (other === node || other.fixedTopLeft || !other.topLeft) continue;
      const distance = distanceBetweenBoxes(
        { topLeft: node.topLeft!, width: node.width, height: node.height },
        { topLeft: other.topLeft, width: other.width, height: other.height },
      );
      if (distance > this.graph.cellSize) continue;
      if (this.overlapsExcept(other, node.topLeft!, node) || this.overlapsExcept(node, other.topLeft, other)) continue;
      const otherCurrent = this.score(other);
      const old = node.topLeft!;
      node.topLeft = other.topLeft;
      other.topLeft = old;
      try {
        if (this.overlapsExcept(node, node.topLeft) || this.overlapsExcept(other, other.topLeft)) continue;
        const swapped = this.score(node);
        if (swapped >= current - precision) continue;
        const otherSwapped = this.score(other);
        const total = swapped + otherSwapped;
        if (total < current + otherCurrent - precision && total < least - precision) {
          least = total;
          best = other;
        }
      } finally {
        other.topLeft = node.topLeft;
        node.topLeft = old;
      }
    }
    return best;
  }

  private overlapsExcept(node: TalaNode, point: Point, exception?: TalaNode): boolean {
    for (const other of this.graph.nodes) {
      if (other === node || other === exception || !other.topLeft) continue;
      if (doesOverlapAt(node, other, point)) return true;
    }
    return false;
  }

  /** Ordinary, non-container branch of upstream transpose. */
  private transpose(node: TalaNode): boolean {
    if (node.fixedTopLeft || node.edges.length < 1 || node.edges.length > 2) return false;
    const adjacent = node.edges.map((edge) => node.adjacent(edge));
    let center: TalaNode;
    let moving: TalaNode[];
    if (adjacent.length === 1) {
      center = adjacent[0]!;
      if (isDiagonal(sizedOrientation(node, center))) return false;
      moving = this.reachable(node, new Set([center]));
    } else {
      const [a, b] = adjacent as [TalaNode, TalaNode];
      if (this.reachable(a, new Set([node])).includes(b)) return false;
      if (isDiagonal(sizedOrientation(node, a)) || isDiagonal(sizedOrientation(node, b))) return false;
      const sideA = this.reachable(a, new Set([node]));
      const sideB = this.reachable(b, new Set([node]));
      center = sideA.length >= sideB.length ? a : b;
      moving = this.reachable(node, new Set([center]));
    }
    if (moving.some((n) => n.fixedTopLeft)) return false;
    const original = new Map(moving.map((n) => [n, { ...n.topLeft! }]));
    const currentCost = this.graphScore();
    let bestCost = currentCost;
    let bestRotation = 0;
    for (let rotations = 1; rotations <= 3; rotations++) {
      for (const [n, position] of original) n.topLeft = rotateAround(n, position, center, rotations);
      if (this.graph.nodes.every((n) => !this.overlapsExcept(n, n.topLeft!))) {
        const cost = this.graphScore();
        if (cost < bestCost - precision) {
          bestCost = cost;
          bestRotation = rotations;
        }
      }
    }
    for (const [n, position] of original) n.topLeft = bestRotation
      ? rotateAround(n, position, center, bestRotation) : position;
    return bestRotation !== 0;
  }

  private reachable(start: TalaNode, ignored: ReadonlySet<TalaNode>): TalaNode[] {
    const queue = [start];
    const visited = new Set(queue);
    const result: TalaNode[] = [];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      result.push(current);
      for (const edge of current.edges) {
        const next = current.adjacent(edge);
        if (ignored.has(next) || visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    return result;
  }

  private graphScore(): number {
    return this.graph.nodes.reduce((sum, node) => sum + this.score(node), 0);
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

function isDiagonal(orientation: string): boolean {
  return orientation === 'TopLeft' || orientation === 'TopRight'
    || orientation === 'BottomLeft' || orientation === 'BottomRight';
}

function rotateAround(node: TalaNode, position: Point, center: TalaNode, times: number): Point {
  const cx = center.topLeft!.x + center.width / 2;
  const cy = center.topLeft!.y + center.height / 2;
  let point = position;
  for (let i = 0; i < times; i++) {
    const x = point.x + node.width / 2 - cx;
    const y = point.y + node.height / 2 - cy;
    point = { x: goRound(-y + cx - node.width / 2), y: goRound(x + cy - node.height / 2) };
  }
  return point;
}
