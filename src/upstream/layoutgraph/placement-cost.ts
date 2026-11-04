// Translated from internal/layoutgraph/placement_cost.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
export function LookupEdgeLengthCost(
  graph: Graph,
  state: bigint,
): [number, boolean] {
  return [
    graph.edgeLengthCache?.get(state) ?? 0,
    graph.edgeLengthCache?.has(state) ?? false,
  ];
}
export function StoreEdgeLengthCost(
  graph: Graph,
  state: bigint,
  cost: number,
): void {
  graph.edgeLengthCache?.set(state, cost);
}
export function EdgeLengthCacheEntries(graph: Graph): number {
  return graph.edgeLengthCache?.size ?? 0;
}
export function ResetPlacementCosts(graph: Graph): void {
  graph.edgeLengthCache?.clear();
  graph.crossingCost = 0;
  graph.turnCost = 0;
  graph.nonCenterPortCost = 0;
}
export class PlacementCostSnapshot {
  private readonly cacheRef: Map<bigint, number> | null;
  private readonly cache: Map<bigint, number> | null;
  private readonly crossingCost: number;
  private readonly turnCost: number;
  private readonly nonCenterPortCost: number;
  constructor(private readonly graph: Graph) {
    this.cacheRef = graph.edgeLengthCache;
    this.cache = this.cacheRef === null ? null : new Map(this.cacheRef);
    this.crossingCost = graph.crossingCost;
    this.turnCost = graph.turnCost;
    this.nonCenterPortCost = graph.nonCenterPortCost;
  }
  Restore(): void {
    if (this.cacheRef === null) this.graph.edgeLengthCache = null;
    else {
      this.cacheRef.clear();
      for (const [key, value] of this.cache!) this.cacheRef.set(key, value);
      this.graph.edgeLengthCache = this.cacheRef;
    }
    this.graph.crossingCost = this.crossingCost;
    this.graph.turnCost = this.turnCost;
    this.graph.nonCenterPortCost = this.nonCenterPortCost;
  }
}
export function SnapshotPlacementCosts(graph: Graph): PlacementCostSnapshot {
  return new PlacementCostSnapshot(graph);
}
