// Translated internal/placement/sized_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { Point } from '../geo/point.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { ContainerPadding } from '../layoutgraph/geometry-policy.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { NewNodeEdgeLengthScorer } from '../placementcost/edge-length-scorer.js';
import { ColumnCrossingCost } from '../placementcost/column-crossing.js';
import { NodeSymmetry } from '../placementcost/symmetry.js';
import { chargeOptimizerScoring } from './optimizer-metrics.js';
import { captureOptimizerCandidateMovement } from './optimizer-movement.js';
import { restoreNodePositions } from './types.js';
import { SizedSearch } from './sized-search.js';

export function moveSizedNodeToBestGuarded(
  ctx: Context,
  optim: SizedSearch,
  node: Node,
  points: Point[],
  mustImprove: boolean,
  guard: OptimizationWorkGuard,
): boolean {
  const scorer = NewNodeEdgeLengthScorer(node, {
    EdgeAbductions: optim.edgeAbductions,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: true,
  });
  try {
    const symmetryCost = optim.cellSize * node.Edges.length;
    let least = Infinity;
    if (mustImprove) {
      chargeOptimizerScoring(node, optim.edgeAbductions, true, guard);
      least = scorer.Score(ctx);
      const crossing = ColumnCrossingCost(ctx, node, optim.edgeAbductions),
        symmetry = NodeSymmetry(ctx, node, optim.edgeAbductions);
      least += crossing;
      least -= symmetry * symmetryCost;
    }
    let leastPoint = node.TopLeft!.Copy();
    const currentX = node.TopLeft!.X,
      currentY = node.TopLeft!.Y;
    const movement = captureOptimizerCandidateMovement(node, guard);
    let complete = false;
    try {
      for (const point of points) {
        guard.Step();
        const x = point.X,
          y = point.Y;
        if (
          optim.fixedOrigin !== null &&
          (x < optim.fixedOrigin.X || y < optim.fixedOrigin.Y)
        )
          continue;
        let canMove = x === currentX && y === currentY;
        if (!canMove) canMove = optim.spatialIndex.canMove(node, point, guard);
        if (!canMove) continue;
        movement.moveAbs(x, y, guard);
        chargeOptimizerScoring(node, optim.edgeAbductions, true, guard);
        let length = scorer.Score(ctx);
        if (
          least !== Infinity &&
          PrecisionCompare(length - symmetryCost, least, PRECISION) === 1
        )
          continue;
        const crossing = ColumnCrossingCost(ctx, node, optim.edgeAbductions),
          symmetry = NodeSymmetry(ctx, node, optim.edgeAbductions);
        length += crossing;
        length -= symmetry * symmetryCost;
        for (const obstacle of optim.obstacles) {
          guard.Step();
          if (
            obstacle.TopLeft.X === -ContainerPadding &&
            obstacle.TopLeft.Y === -ContainerPadding
          )
            continue;
          if (node.Box.Overlaps(obstacle)) length += 3 * TurnCost(optim.graph);
        }
        switch (PrecisionCompare(length, least, PRECISION)) {
          case -1:
            least = length;
            leastPoint = point;
            break;
          case 0:
            if (point.X === currentX && point.Y === currentY) {
              least = length;
              leastPoint = point;
            }
        }
      }
      const error = ctx.Err();
      if (error !== null)
        throw new Error(`EdgeLength: ${error.message}`, { cause: error });
      if (least === Infinity)
        throw new Error('sizedOptimizer: could not find any placement');
      movement.moveAbs(leastPoint.X, leastPoint.Y, guard);
      complete = true;
      return node.TopLeft!.X !== currentX || node.TopLeft!.Y !== currentY;
    } finally {
      if (!complete) restoreNodePositions(movement.positions);
    }
  } finally {
    scorer.Close();
  }
}
