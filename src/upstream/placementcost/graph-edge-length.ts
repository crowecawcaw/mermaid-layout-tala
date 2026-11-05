// Translated internal/placementcost/graph.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import {
  CrossingCost,
  LookupEdgeLengthCost,
  StoreEdgeLengthCost,
} from '../layoutgraph/placement-cost.js';
import { checkScoringCancellation } from './geometry.js';
import { NodeEdgeLength } from './edge-length.js';
import type { EdgeLengthOptions } from './edge-preparation.js';
import { ColumnCrossingCost } from './column-crossing.js';
import { NodeSymmetry } from './symmetry.js';
import { GraphEdgeCrossings } from './graph-cost.js';

export function placementEdgeLengthState(
  graph: Graph,
  options: EdgeLengthOptions,
): bigint {
  let hash = 14695981039346656037n;
  const mix = (value: number): void => {
    hash = BigInt.asUintN(64, (hash ^ BigInt(value)) * 1099511628211n);
  };
  const uint64 = (value: bigint): void => {
    let n = BigInt.asUintN(64, value);
    for (let i = 0; i < 8; i++) {
      mix(Number(n & 255n));
      n >>= 8n;
    }
  };
  const buffer = new DataView(new ArrayBuffer(8));
  const float = (value: number): void => {
    buffer.setFloat64(0, value, true);
    uint64(buffer.getBigUint64(0, true));
  };
  mix(
    (options.IncludeNodeSizes ? 1 : 0) |
      (options.EnforceMinimumGap ? 2 : 0) |
      (options.PenalizeDirection ? 4 : 0),
  );
  float(graph.CellSize);
  float(graph.turnCost);
  float(graph.nonCenterPortCost);
  float(graph.crossingCost);
  for (const node of graph.Nodes) {
    if (node.TopLeft === null) return 0n;
    uint64(node.ID);
    float(node.TopLeft.X);
    float(node.TopLeft.Y);
    float(node.Width);
    float(node.Height);
    for (const edge of node.Edges) uint64(edge.ID);
  }
  for (const ab of options.EdgeAbductions ?? []) {
    uint64(ab.Edge.ID);
    if (ab.OriginallyFrom !== null) uint64(ab.OriginallyFrom.ID);
    if (ab.OriginallyTo !== null) uint64(ab.OriginallyTo.ID);
    if (ab.CurrentTo !== null) uint64(ab.CurrentTo.ID);
    if (ab.CurrentFrom !== null) uint64(ab.CurrentFrom.ID);
  }
  return hash;
}
export function edgeLengthWorkerCount(
  nodeCount: number,
  gomaxprocs: number,
): number {
  if (nodeCount <= 0) return 0;
  if (nodeCount <= 10) return 1;
  if (gomaxprocs < 1) gomaxprocs = 1;
  return Math.min(nodeCount, gomaxprocs);
}
export function EdgeLength(
  ctx: Context,
  graph: Graph,
  options: EdgeLengthOptions,
): number {
  checkScoringCancellation(ctx);
  const state = placementEdgeLengthState(graph, options);
  if (state !== 0n) {
    const [value, ok] = LookupEdgeLengthCost(graph, state);
    if (ok) return value;
  }
  let total = 0;
  for (const node of graph.Nodes) {
    let cost = NodeEdgeLength(ctx, node, options);
    if (options.IncludeNodeSizes) {
      const column = ColumnCrossingCost(ctx, node, options.EdgeAbductions);
      const symmetry = NodeSymmetry(ctx, node, options.EdgeAbductions);
      cost += column;
      cost -= symmetry * graph.CellSize * node.Edges.length;
    }
    checkScoringCancellation(ctx);
    total += cost;
  }
  const crossings = GraphEdgeCrossings(ctx, graph);
  total += CrossingCost(graph) * crossings;
  checkScoringCancellation(ctx);
  if (state !== 0n) StoreEdgeLengthCost(graph, state, total);
  return total;
}
