// Translated internal/placement/sizeless_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import {
  Shuffle,
  type OptimizationWorkGuard,
  type Random,
} from '../limits/optimization.js';
import { NodeEdgeLength } from '../placementcost/edge-length.js';
import { NewNodeEdgeLengthScorer } from '../placementcost/edge-length-scorer.js';
import { restoreNodePositions } from './types.js';
import { chargeOptimizerScoring } from './optimizer-metrics.js';
import {
  captureOptimizerCandidateMovement,
  withOptimizerPositionsSwapped,
} from './optimizer-movement.js';
import {
  SizelessCandidates,
  canOptimizeNodeGuarded,
} from './sizeless-candidates.js';
const options = {
  EdgeAbductions: null,
  IncludeNodeSizes: false,
  EnforceMinimumGap: false,
  PenalizeDirection: true,
};
export function moveNodeToBestGuarded(
  ctx: Context,
  node: Node,
  points: (Point | null)[],
  guard: OptimizationWorkGuard,
): boolean {
  const scorer = NewNodeEdgeLengthScorer(node, options);
  let least = Infinity,
    leastPoint = node.TopLeft!.Copy();
  const currentX = node.TopLeft!.X,
    currentY = node.TopLeft!.Y;
  const movement = captureOptimizerCandidateMovement(node, guard);
  let complete = false;
  try {
    for (const point of points) {
      guard.Step();
      if (point === null)
        throw new Error(
          'TALA sizelessOptimizer.optimize found a nil placement point',
        );
      movement.moveAbs(point.X, point.Y, guard);
      chargeOptimizerScoring(node, null, false, guard);
      const length = scorer.Score(ctx);
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
      throw new Error(
        'sizelessOptimizer.moveNodeToBest: could not find any placement',
      );
    movement.moveAbs(leastPoint.X, leastPoint.Y, guard);
    complete = true;
    return node.TopLeft!.X !== currentX || node.TopLeft!.Y !== currentY;
  } finally {
    if (!complete) restoreNodePositions(movement.positions);
    scorer.Close();
  }
}
export function swapCandidatesGuarded(
  optim: SizelessCandidates,
  node: Node,
  guard: OptimizationWorkGuard,
): Node[] {
  const adjacent: Node[] = [],
    tl = node.TopLeft!;
  let adjacentError: unknown = null;
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    try {
      guard.Step();
      const candidate = optim.occupiedAt(new Point(tl.X + dx, tl.Y + dy));
      if (
        candidate !== null &&
        canOptimizeNodeGuarded(candidate, optim.graph, guard)
      )
        adjacent.push(candidate);
    } catch (error) {
      adjacentError = error;
    }
  }
  if (adjacentError !== null) throw adjacentError;
  return adjacent;
}
export function bestSwapCandidateGuarded(
  ctx: Context,
  optim: SizelessCandidates,
  node: Node,
  random: Random,
  guard: OptimizationWorkGuard,
): Node | null {
  chargeOptimizerScoring(node, null, false, guard);
  let min = NodeEdgeLength(ctx, node, options),
    best: Node | null = null;
  const candidates = swapCandidatesGuarded(optim, node, guard);
  Shuffle(candidates, random, guard);
  for (const candidate of candidates) {
    guard.Step();
    chargeOptimizerScoring(candidate, null, false, guard);
    const current = NodeEdgeLength(ctx, candidate, options);
    let swapped1 = 0,
      swapped2 = 0;
    withOptimizerPositionsSwapped(node, candidate, guard, () => {
      chargeOptimizerScoring(node, null, false, guard);
      swapped1 = NodeEdgeLength(ctx, node, options);
      if (PrecisionCompare(swapped1, min, PRECISION) < 0) {
        chargeOptimizerScoring(candidate, null, false, guard);
        swapped2 = NodeEdgeLength(ctx, candidate, options);
      }
    });
    if (
      PrecisionCompare(swapped1, min, PRECISION) < 0 &&
      PrecisionCompare(swapped2, current, PRECISION) <= 0
    ) {
      min = swapped1;
      best = candidate;
    }
  }
  const error = ctx.Err();
  if (error !== null)
    throw new Error(`EdgeLength: ${error.message}`, { cause: error });
  return best;
}
