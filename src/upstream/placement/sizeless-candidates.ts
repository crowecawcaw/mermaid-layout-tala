// Translated internal/placement/sizeless_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
  ErrOptimizationResourceLimit,
} from '../limits/optimization.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import {
  optimizerFixedOrigin,
  optimizerIsDescendantOf,
} from './optimizer-ancestry.js';
import { optimizerMedianToNeighbors } from './optimizer-metrics.js';
import { numPointsWithinManhattanDistance } from './types.js';

export function canOptimizeNodeGuarded(
  node: Node | null,
  graph: Graph | null,
  guard: OptimizationWorkGuard,
): boolean {
  if (node === null || graph === null)
    throw new Error(`TALA ${guard.Location()} found a nil optimizer node`);
  if (node.Edges.length === 0) {
    let hasUsableNear = false;
    for (const near of node.Nears) {
      guard.Step();
      if (optimizerIsDescendantOf(near, node.Container, guard)) {
        hasUsableNear = true;
        break;
      }
    }
    if (!hasUsableNear) return false;
  }
  if (node.FixedTopLeft !== null) return false;
  return !graph.NodeToTree.has(node);
}
export class SizelessCandidates {
  readonly nodes: Node[] = [];
  private occupied = new Map<string, Node>();
  constructor(
    ctx: Context,
    readonly graph: Graph,
    readonly random: { float64(): number } | null,
  ) {
    if (graph == null)
      throw new Error('TALA sizelessOptimizer requires a graph');
    if (graph.Nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA sizelessOptimizer node count exceeds limit ${MaxEngineNodes}`,
      );
    if (graph.Edges.length > MaxEngineEdges)
      throw new Error(
        `TALA sizelessOptimizer edge count exceeds limit ${MaxEngineEdges}`,
      );
    const guard = new OptimizationWorkGuard(
      ctx,
      'sizelessOptimizer.setup',
      MaxOptimizationWorkUnits,
    );
    for (const node of graph.Nodes) {
      guard.Step();
      if (node == null || node.Graph === null)
        throw new Error('TALA sizelessOptimizer found a node without a graph');
      if (
        node.Edges.length > MaxEngineEdges ||
        node.Nears.size > MaxEngineNodes
      )
        throw new Error(
          `TALA sizelessOptimizer node ${nodeDebugID(node)} adjacency references exceed engine limits`,
        );
      if (node.Graph.CellSize !== graph.CellSize)
        throw new Error(
          `mismatch of cell size, graph=${graph.CellSize.toFixed(6)}, node=${node.Graph.CellSize.toFixed(6)}`,
        );
    }
    this.resetOccupied();
    for (const node of graph.Nodes) {
      guard.Step();
      if (canOptimizeNodeGuarded(node, graph, guard)) this.nodes.push(node);
    }
    guard.Finish();
  }
  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
  resetOccupied(): void {
    this.occupied.clear();
    for (const n of this.graph.Nodes)
      if (
        n.TopLeft !== null &&
        !Number.isNaN(n.TopLeft.X) &&
        !Number.isNaN(n.TopLeft.Y)
      )
        this.occupied.set(this.key(n.TopLeft.X, n.TopLeft.Y), n);
  }
  isOccupied(p: Point): boolean {
    return (
      !Number.isNaN(p.X) &&
      !Number.isNaN(p.Y) &&
      this.occupied.has(this.key(p.X, p.Y))
    );
  }
  medianPointGuarded(
    node: Node,
    temp: number,
    guard: OptimizationWorkGuard,
  ): Point {
    let [x, y] = optimizerMedianToNeighbors(node, false, null, guard);
    const cell = this.graph.CellSize,
      origin = optimizerFixedOrigin(this.graph, node.container(), guard);
    if (origin !== null) {
      if (!(cell > 0) || !Number.isFinite(cell))
        throw new Error(
          `TALA ${guard.Location()} fixed-origin placement requires a finite positive cell size`,
        );
      if (x < origin.X / cell) {
        x = origin.X / cell;
        x += temp;
      }
      if (y < origin.Y / cell) {
        y = origin.Y / cell;
        y += temp;
      }
    }
    x += -temp + this.random!.float64() * (2 * temp);
    y += -temp + this.random!.float64() * (2 * temp);
    if (origin !== null) {
      x = Math.max(x, origin.X / cell);
      y = Math.max(y, origin.Y / cell);
    }
    return new Point(Round(x), Round(y));
  }
  private origin(node: Node, guard: OptimizationWorkGuard): Point | null {
    const origin = optimizerFixedOrigin(node.Graph!, node.container(), guard);
    if (origin !== null) {
      const cell = node.Graph!.CellSize;
      if (!(cell > 0) || !Number.isFinite(cell))
        throw new Error(
          `TALA ${guard.Location()} fixed-origin placement requires a finite positive cell size`,
        );
      origin.X = Round(origin.X / cell);
      origin.Y = Round(origin.Y / cell);
    }
    return origin;
  }
  findClosestUnoccupiedDistanceGuarded(
    node: Node | null,
    median: Point | null,
    guard: OptimizationWorkGuard,
  ): number {
    if (node === null || node.Graph === null || median === null)
      throw new Error(
        `TALA ${guard.Location()} placement search requires a node, graph, and median`,
      );
    const origin = this.origin(node, guard),
      past = (x: number, y: number): boolean =>
        origin !== null && (x < origin.X || y < origin.Y);
    for (let curr = 0; curr <= 100; curr++) {
      guard.Step();
      for (let x = curr, y = 0; x >= -curr; x--) {
        guard.Step();
        if (y !== 0) {
          const p = new Point(median.X + x, median.Y - y);
          if (!past(p.X, p.Y) && !this.isOccupied(p)) return curr;
        }
        const p = new Point(median.X + x, median.Y + y);
        if (!past(p.X, p.Y) && !this.isOccupied(p)) return curr;
        if (x > 0) y++;
        else y--;
      }
    }
    throw new Error(
      `no unoccupied points within d=100 of p=&{${median.X} ${median.Y}}`,
    );
  }
  placementPointsGuarded(
    node: Node | null,
    median: Point | null,
    minDistance: number,
    guard: OptimizationWorkGuard,
  ): Point[] {
    if (node === null || node.Graph === null || median === null)
      throw new Error(
        `TALA ${guard.Location()} placement generation requires a node, graph, and median`,
      );
    if (minDistance < 0 || minDistance > 100 || !Number.isFinite(minDistance))
      throw new Error(
        `TALA ${guard.Location()} placement distance must be finite and within [0, 100]`,
      );
    const distance = minDistance + 1,
      capacity = numPointsWithinManhattanDistance(distance) + 1;
    if (capacity < 0 || capacity > 1_000_000)
      throw new Error(
        `${ErrOptimizationResourceLimit.message}: TALA sizelessOptimizer.optimize placement candidates exceed limit 1000000`,
        { cause: ErrOptimizationResourceLimit },
      );
    const points: Point[] = [],
      origin = this.origin(node, guard),
      past = (x: number, y: number): boolean =>
        origin !== null && (x < origin.X || y < origin.Y);
    for (let x = distance; x >= -distance; x--) {
      guard.Step();
      for (let y = 0; y <= distance - Math.abs(x); y++) {
        guard.Step();
        if (y !== 0) {
          const p = new Point(median.X + x, median.Y - y);
          if (!past(p.X, p.Y) && !this.isOccupied(p)) points.push(p);
        }
        const p = new Point(median.X + x, median.Y + y);
        if (!past(p.X, p.Y) && !this.isOccupied(p)) points.push(p);
      }
    }
    return points;
  }
}
