// Translated internal/placementcost/symmetry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { facingTablePorts } from '../layoutgraph/ports.js';
import { CrossingCostWeight } from '../layoutgraph/geometry-policy.js';
import {
  CountSegmentCrossingsContext,
  type CrossingSegment,
} from '../layoutgraph/segment-crossing.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from './geometry.js';

export function ColumnCrossingCost(
  ctx: Context,
  node: Node,
  abductions: EdgeAbduction[] | null,
): number {
  checkScoringCancellation(ctx);
  if (!node.IsTable()) return 0;
  const edgeToAbduction = new Map<Edge, EdgeAbduction>(),
    segments: CrossingSegment[] = [];
  for (let i = 0; i < (abductions?.length ?? 0); i++) {
    scoringCancellationError(ctx, i);
    const abduction = abductions![i]!;
    edgeToAbduction.set(abduction.Edge, abduction);
  }
  for (let i = 0; i < node.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    const edge = node.Edges[i]!,
      abduction = edgeToAbduction.get(edge);
    const ports = facingTablePorts(
      edge,
      abduction?.OriginallyFrom ?? null,
      abduction?.OriginallyTo ?? null,
    );
    if (!ports.hasFrom || !ports.hasTo) continue;
    segments.push({ Start: ports.from, End: ports.to });
  }
  const crossings = CountSegmentCrossingsContext(ctx, segments);
  return CrossingCostWeight * crossings * node.Graph!.CellSize;
}
