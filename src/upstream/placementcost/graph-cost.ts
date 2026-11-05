// Translated internal/placementcost/graph.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import { containerLevel } from '../layoutgraph/placement-ancestry.js';
import { SegmentsCross } from '../layoutgraph/segment-crossing.js';
import { NonCenterPortCost } from '../layoutgraph/placement-cost.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from './geometry.js';

export function countEdgeCrossingsExcludingSharedNodes(
  ctx: Context,
  edges: Edge[],
): number {
  let crossings = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    scoringCancellationError(ctx, i);
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length; j++) {
      scoringCancellationError(ctx, j - i - 1);
      const b = edges[j]!;
      if (
        a.From === b.From ||
        a.From === b.To ||
        a.To === b.From ||
        a.To === b.To
      )
        continue;
      if (
        SegmentsCross(
          a.From.Center(),
          a.To.Center(),
          b.From.Center(),
          b.To.Center(),
        )
      )
        crossings++;
    }
  }
  checkScoringCancellation(ctx);
  return crossings;
}
export function GraphEdgeCrossings(ctx: Context, graph: Graph): number {
  checkScoringCancellation(ctx);
  if (graph.Edges.length === 0) {
    checkScoringCancellation(ctx);
    return 0;
  }
  const groups = new Map<number, Edge[]>();
  for (let i = 0; i < graph.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    const edge = graph.Edges[i]!;
    if (
      edge.From == null ||
      edge.To == null ||
      edge.From.TopLeft === null ||
      edge.To.TopLeft === null
    )
      continue;
    const fromLevel = containerLevel(edge.From),
      toLevel = containerLevel(edge.To);
    if (fromLevel !== toLevel) continue;
    const group = groups.get(fromLevel) ?? [];
    group.push(edge);
    groups.set(fromLevel, group);
  }
  let total = 0;
  for (const group of groups.values())
    total += countEdgeCrossingsExcludingSharedNodes(ctx, group);
  checkScoringCancellation(ctx);
  return total;
}
export function ContainerAlignmentCost(ctx: Context, graph: Graph): number {
  checkScoringCancellation(ctx);
  let cost = 0;
  for (let i = 0; i < graph.Nodes.length - 1; i++) {
    scoringCancellationError(ctx, i);
    const a = graph.Nodes[i]!;
    if (!a.isContainer) continue;
    for (let j = i + 1; j < graph.Nodes.length; j++) {
      scoringCancellationError(ctx, j - i - 1);
      const b = graph.Nodes[j]!;
      if (!b.isContainer || a.container() !== b.container()) continue;
      if (
        a.Width === b.Width &&
        a.Height === b.Height &&
        a.TopLeft!.X !== b.TopLeft!.X &&
        a.TopLeft!.Y !== b.TopLeft!.Y
      )
        cost += NonCenterPortCost(graph);
    }
  }
  checkScoringCancellation(ctx);
  return cost;
}
