// Translated internal/placement/optimizer_spatial_index.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Point } from '../geo/point.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes } from '../limits/work.js';
import { deltaToGuarded } from '../layoutgraph/node-spacing.js';
import {
  optimizerCanMove,
  optimizerDoesOverlap,
  optimizerIsOccupied,
} from './optimizer-metrics.js';
interface Entry {
  graphIndex: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface OccupiedEntry {
  graphIndex: number;
  generation: bigint;
}
const key = (p: Point): string => `${p.X},${p.Y}`;
const finiteBox = (n: Node): boolean =>
  n.TopLeft !== null &&
  n.Width >= 0 &&
  n.Height >= 0 &&
  [
    n.TopLeft.X,
    n.TopLeft.Y,
    n.Width,
    n.Height,
    n.TopLeft.X + n.Width,
    n.TopLeft.Y + n.Height,
  ].every(Number.isFinite);
export class OptimizerSpatialIndex {
  private graph: Graph | null = null;
  private nodeCount = 0;
  private occupancyUsable = false;
  private spatialUsable = false;
  private entries: Entry[] = [];
  private maxRight: number[] = [];
  private candidates: number[] = [];
  private occupied = new Map<string, OccupiedEntry>();
  private generation = 0n;
  rebuild(graph: Graph | null, guard: OptimizationWorkGuard): void {
    if (graph === null)
      throw new Error(
        `TALA ${guard.Location()} spatial index requires a graph`,
      );
    if (graph.Nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} spatial index node count exceeds limit ${MaxEngineNodes}`,
      );
    this.graph = graph;
    this.nodeCount = graph.Nodes.length;
    this.occupancyUsable = true;
    this.spatialUsable = graph.Nodes.length >= 96;
    this.entries = [];
    this.candidates = [];
    this.generation = BigInt.asUintN(64, this.generation + 1n);
    if (
      this.generation === 0n ||
      this.occupied.size > Math.max(64, 4 * graph.Nodes.length)
    ) {
      this.occupied.clear();
      this.generation = 1n;
    }
    for (let i = 0; i < graph.Nodes.length; i++) {
      guard.Step();
      const node = graph.Nodes[i];
      if (node == null)
        throw new Error(`TALA ${guard.Location()} found a nil graph node`);
      if (node.TopLeft === null) continue;
      if (
        !Number.isFinite(node.TopLeft.X) ||
        !Number.isFinite(node.TopLeft.Y)
      ) {
        this.occupancyUsable = false;
        this.spatialUsable = false;
        continue;
      }
      const k = key(node.TopLeft),
        entry = this.occupied.get(k);
      if (entry === undefined || entry.generation !== this.generation)
        this.occupied.set(k, { graphIndex: i, generation: this.generation });
      if (!this.spatialUsable) continue;
      if (!finiteBox(node)) {
        this.spatialUsable = false;
        continue;
      }
      this.entries.push({
        graphIndex: i,
        left: node.TopLeft.X,
        top: node.TopLeft.Y,
        right: node.TopLeft.X + node.Width,
        bottom: node.TopLeft.Y + node.Height,
      });
    }
    if (!this.spatialUsable || this.entries.length === 0) {
      guard.Finish();
      return;
    }
    guard.AddSort(this.entries.length);
    this.entries.sort((a, b) =>
      a.left !== b.left
        ? a.left < b.left
          ? -1
          : b.left < a.left
            ? 1
            : 0
        : a.graphIndex - b.graphIndex,
    );
    this.maxRight = new Array<number>(4 * this.entries.length).fill(0);
    this.buildMaxRight(1, 0, this.entries.length);
    guard.Finish();
  }
  private buildMaxRight(index: number, low: number, high: number): number {
    if (high - low === 1)
      return (this.maxRight[index] = this.entries[low]!.right);
    const middle = low + Math.floor((high - low) / 2),
      left = this.buildMaxRight(index * 2, low, middle),
      right = this.buildMaxRight(index * 2 + 1, middle, high);
    return (this.maxRight[index] = Math.max(left, right));
  }
  private query(
    left: number,
    top: number,
    right: number,
    bottom: number,
    guard: OptimizationWorkGuard,
  ): number[] {
    this.candidates = [];
    if (!this.spatialUsable || this.entries.length === 0) {
      guard.Finish();
      return this.candidates;
    }
    this.queryTree(1, 0, this.entries.length, left, top, right, bottom, guard);
    guard.AddSort(this.candidates.length);
    this.candidates.sort((a, b) => a - b);
    guard.Finish();
    return this.candidates;
  }
  private queryTree(
    index: number,
    low: number,
    high: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
    guard: OptimizationWorkGuard,
  ): void {
    guard.Step();
    if (
      low >= high ||
      this.maxRight[index]! < left ||
      this.entries[low]!.left > right
    )
      return;
    if (high - low === 1) {
      const entry = this.entries[low]!;
      if (
        entry.left <= right &&
        entry.right >= left &&
        entry.top <= bottom &&
        entry.bottom >= top
      )
        this.candidates.push(entry.graphIndex);
      return;
    }
    const middle = low + Math.floor((high - low) / 2);
    this.queryTree(index * 2, low, middle, left, top, right, bottom, guard);
    this.queryTree(
      index * 2 + 1,
      middle,
      high,
      left,
      top,
      right,
      bottom,
      guard,
    );
  }
  isOccupied(
    graph: Graph,
    point: Point,
    guard: OptimizationWorkGuard,
  ): [Node | null, boolean] {
    if (
      this.graph !== graph ||
      this.nodeCount !== graph.Nodes.length ||
      !this.occupancyUsable ||
      !Number.isFinite(point.X) ||
      !Number.isFinite(point.Y)
    )
      return optimizerIsOccupied(graph, point, guard);
    guard.Step();
    const entry = this.occupied.get(key(point));
    if (entry === undefined || entry.generation !== this.generation) {
      guard.Finish();
      return [null, false];
    }
    if (entry.graphIndex < 0 || entry.graphIndex >= graph.Nodes.length)
      throw new Error(
        `TALA ${guard.Location()} spatial occupancy index is stale`,
      );
    guard.Finish();
    return [graph.Nodes[entry.graphIndex]!, true];
  }
  doesOverlap(
    node: Node | null,
    point: Point | null,
    exceptions: Node[],
    guard: OptimizationWorkGuard,
  ): boolean {
    if (node === null || node.Graph === null || point === null)
      throw new Error(
        `TALA ${guard.Location()} overlap check requires a node, graph, and point`,
      );
    if (
      node.Graph.Nodes.length > MaxEngineNodes ||
      exceptions.length > MaxEngineNodes
    )
      throw new Error(
        `TALA ${guard.Location()} overlap inputs exceed node limit ${MaxEngineNodes}`,
      );
    if (
      this.graph !== node.Graph ||
      this.nodeCount !== node.Graph.Nodes.length ||
      !this.spatialUsable ||
      ![
        point.X,
        point.Y,
        node.Width,
        node.Height,
        point.X + node.Width,
        point.Y + node.Height,
      ].every(Number.isFinite) ||
      node.Width < 0 ||
      node.Height < 0
    )
      return optimizerDoesOverlap(node, point, exceptions, guard);
    const candidates = this.query(
        point.X - 500,
        point.Y - 500,
        point.X + node.Width + 500,
        point.Y + node.Height + 500,
        guard,
      ),
      right = point.X + node.Width,
      bottom = point.Y + node.Height;
    for (const index of candidates) {
      guard.Step();
      const other: Node = node.Graph!.Nodes[index]!;
      if (other === node) continue;
      let excluded = false;
      for (const exception of exceptions) {
        guard.Step();
        if (exception === other) {
          excluded = true;
          break;
        }
      }
      if (excluded || other.TopLeft === null) continue;
      guard.Add(BigInt(node.Edges.length));
      const delta = deltaToGuarded(node, other, point, null);
      if (
        point.X < other.TopLeft.X + other.Width + delta &&
        right + delta > other.TopLeft.X &&
        point.Y < other.TopLeft.Y + other.Height + delta &&
        bottom + delta > other.TopLeft.Y
      )
        return true;
    }
    guard.Finish();
    return false;
  }
  canMove(
    node: Node | null,
    point: Point | null,
    guard: OptimizationWorkGuard,
  ): boolean {
    if (node === null || node.Graph === null || point === null)
      throw new Error(
        `TALA ${guard.Location()} movement check requires a node, graph, and point`,
      );
    if (node.TopLeft!.Equals(point)) return true;
    if (
      node.isContainer ||
      node.isClusterVessel ||
      node.Graph.Sequences.has(node)
    )
      return optimizerCanMove(node, point, true, guard);
    const [, occupied] = this.isOccupied(node.Graph, point, guard);
    if (occupied) return false;
    return !this.doesOverlap(node, point, [], guard);
  }
}
