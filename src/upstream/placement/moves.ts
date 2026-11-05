// Translated internal/placement/moves.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { Round, PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { NodeEdgeLength } from '../placementcost/edge-length.js';
import { ColumnCrossingCost } from '../placementcost/column-crossing.js';
import { NodeSymmetry } from '../placementcost/symmetry.js';
import { optimizerFixedOrigin } from './optimizer-ancestry.js';
import {
  optimizerCanMove,
  chargeOptimizerScoring,
} from './optimizer-metrics.js';
import { optimizerMoveNodeAbs } from './optimizer-movement.js';

export function moveNodeToBest(
  ctx: Context,
  graph: Graph,
  node: Node,
  points: (Point | null)[],
  abductions: EdgeAbduction[] | null,
  includeSizes: boolean,
  guard: OptimizationWorkGuard | null,
): boolean {
  if (guard === null)
    throw new Error('TALA moveNodeToBest requires a work guard');
  guard.Finish();
  const symmetryCost = graph.CellSize * node.Edges.length;
  let least = Infinity,
    leastPoint = node.TopLeft!.Copy();
  const currentX = node.TopLeft!.X,
    currentY = node.TopLeft!.Y;
  const fixedOrigin = optimizerFixedOrigin(graph, node.container(), guard);
  if (fixedOrigin !== null && !includeSizes) {
    fixedOrigin.X = Round(fixedOrigin.X / graph.CellSize);
    fixedOrigin.Y = Round(fixedOrigin.Y / graph.CellSize);
  }
  for (const point of points) {
    guard.Step();
    if (point === null)
      throw new Error(`TALA ${guard.Location()} found a nil placement point`);
    const x = point.X,
      y = point.Y;
    if (fixedOrigin !== null && (x < fixedOrigin.X || y < fixedOrigin.Y))
      continue;
    let canMove = x === currentX && y === currentY;
    if (!canMove) canMove = optimizerCanMove(node, point, includeSizes, guard);
    if (!canMove) continue;
    optimizerMoveNodeAbs(node, x, y, guard);
    chargeOptimizerScoring(node, abductions, includeSizes, guard);
    let edgeLength = NodeEdgeLength(ctx, node, {
      EdgeAbductions: abductions,
      IncludeNodeSizes: includeSizes,
      EnforceMinimumGap: false,
      PenalizeDirection: true,
    });
    if (includeSizes) {
      if (
        least !== Infinity &&
        PrecisionCompare(edgeLength - symmetryCost, least, PRECISION) === 1
      )
        continue;
      const crossing = ColumnCrossingCost(ctx, node, abductions),
        symmetry = NodeSymmetry(ctx, node, abductions);
      edgeLength += crossing;
      edgeLength -= symmetry * symmetryCost;
    }
    switch (PrecisionCompare(edgeLength, least, PRECISION)) {
      case -1:
        least = edgeLength;
        leastPoint = point;
        break;
      case 0:
        if (point.X === currentX && point.Y === currentY) {
          least = edgeLength;
          leastPoint = point;
        }
    }
  }
  const error = ctx.Err();
  if (error !== null)
    throw new Error(`EdgeLength: ${error.message}`, { cause: error });
  if (least === Infinity)
    throw new Error(
      'sizedOptimizer.moveNodeToBest: could not find any placement',
    );
  optimizerMoveNodeAbs(node, leastPoint.X, leastPoint.Y, guard);
  guard.Finish();
  return node.TopLeft!.X !== currentX || node.TopLeft!.Y !== currentY;
}
