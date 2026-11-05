// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from './geometry.js';
import {
  prepareNodeEdgeLength,
  type EdgeLengthOptions,
} from './edge-preparation.js';
import { edgeRouteGeometry } from './edge-route-geometry.js';
import { edgeDistance } from './edge-distance.js';
import { addObstructionCost } from './obstruction-cost.js';
import { addClusterArrangementCosts } from './cluster-penalties.js';
import { addTableCrossingCosts } from './table-crossings.js';
import { edgeDirectionAndLabelPenalty } from './edge-penalties.js';
import { finishNodeEdgeLength } from './edge-tail.js';

export function NodeEdgeLength(
  ctx: Context,
  node: Node,
  options: EdgeLengthOptions,
): number {
  checkScoringCancellation(ctx);
  const scratch = prepareNodeEdgeLength(ctx, node, options);
  let total = 0;
  const includeSizes = options.IncludeNodeSizes;
  const minimum =
    includeSizes && options.EnforceMinimumGap ? node.Graph!.CellSize : 0;
  for (let i = 0; i < node.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    const edge = node.Edges[i]!,
      adjacentNode = node.Adjacent(edge);
    if (adjacentNode.TopLeft === null) continue;
    const replacement = scratch.nRepl[i]!,
      adjacent = scratch.aRepl[i]!;
    const route = edgeRouteGeometry(replacement, adjacent, includeSizes);
    if (route === null) continue;
    let distance = edgeDistance(
      node,
      adjacentNode,
      edge,
      replacement,
      adjacent,
      includeSizes,
      route,
    );
    const bothColumns =
      edge.FromTableColumnIndex !== null && edge.ToTableColumnIndex !== null;
    if (includeSizes && !bothColumns) {
      distance = addObstructionCost(
        ctx,
        node,
        replacement,
        adjacent,
        route,
        distance,
      );
      distance = addClusterArrangementCosts(
        node,
        replacement,
        adjacent,
        route.direction,
        distance,
      );
    }
    if (includeSizes && bothColumns)
      distance = addTableCrossingCosts(
        ctx,
        node,
        edge,
        replacement,
        adjacent,
        route.direction,
        distance,
      );
    distance = Math.max(distance, minimum);
    distance = edgeDirectionAndLabelPenalty(
      node,
      edge,
      replacement,
      adjacent,
      route.direction,
      options,
      scratch,
      distance,
    );
    total += distance;
  }
  return finishNodeEdgeLength(ctx, node, includeSizes, scratch, total);
}
export function NodesEdgeLength(
  ctx: Context,
  nodes: Node[],
  options: EdgeLengthOptions,
): number {
  checkScoringCancellation(ctx);
  let result = 0;
  for (const node of nodes) result += NodeEdgeLength(ctx, node, options);
  checkScoringCancellation(ctx);
  return result;
}
