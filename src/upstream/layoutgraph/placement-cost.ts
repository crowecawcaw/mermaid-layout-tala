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

// Lazy routing/placement cost values from upstream graph.go.
import { distanceTo } from './node-spatial.js';
import { ConnectedNodeGap, CrossingCostWeight } from './geometry-policy.js';
export function maxEdgeLength(g: Graph): number {
  let hasLength = false,
    maxLength = ConnectedNodeGap;
  for (const n of g.Nodes) {
    if (n.TopLeft === null) continue;
    for (const e of n.Edges) {
      const adjacent = n.Adjacent(e);
      if (adjacent.TopLeft === null) continue;
      hasLength = true;
      maxLength = Math.max(maxLength, distanceTo(n, adjacent, true));
    }
  }
  return hasLength ? maxLength : 0;
}
export function TurnCost(g: Graph): number {
  if (g.turnCost !== 0) return g.turnCost;
  return (g.turnCost = 0.125 * g.Edges.length * maxEdgeLength(g));
}
export function CrossingCost(g: Graph): number {
  if (g.crossingCost !== 0) return g.crossingCost;
  return (g.crossingCost =
    CrossingCostWeight * g.Edges.length * maxEdgeLength(g));
}
export function NonCenterPortCost(g: Graph): number {
  if (g.nonCenterPortCost !== 0) return g.nonCenterPortCost;
  if (g.Edges.length === 0) return 0;
  let cost = 0.04287499999999999 * g.Edges.length * maxEdgeLength(g),
    minSize = Infinity;
  for (const n of g.Nodes) {
    if (n.isContainer) continue;
    minSize = Math.min(minSize, n.Height);
    minSize = Math.min(minSize, n.Width);
  }
  if (minSize !== Infinity) cost = Math.max(cost, minSize / 3);
  return (g.nonCenterPortCost = cost);
}
