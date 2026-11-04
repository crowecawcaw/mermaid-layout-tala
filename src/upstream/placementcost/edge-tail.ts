// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { Orientation as O } from '../geo/orientation.js';
import { distanceTo } from '../layoutgraph/node-spatial.js';
import {
  scoringCancellationError,
  checkScoringCancellation,
} from './geometry.js';
import { AxisScore } from './axis.js';
import { flowContinuityCost } from './flow-continuity.js';
import type { EdgeLengthPreparation } from './edge-preparation.js';

export function finishNodeEdgeLength(
  ctx: Context,
  node: Node,
  includeSizes: boolean,
  scratch: EdgeLengthPreparation,
  totalDistance: number,
): number {
  if (node.Nears.size > 0) {
    let minDistanceToNear = Infinity,
      nearIndex = 0;
    for (const near of node.Nears) {
      scoringCancellationError(ctx, nearIndex++);
      if (near.TopLeft === null) {
        minDistanceToNear = 0;
        continue;
      }
      minDistanceToNear = Math.min(
        minDistanceToNear,
        distanceTo(node, near, includeSizes),
      );
    }
    totalDistance += minDistanceToNear;
  }
  if (node.HerdAssignment !== null && includeSizes) {
    const herd = node.HerdAssignment;
    let d = 0;
    switch (herd.Orientation) {
      case O.Bottom:
        d = herd.Val - (node.TopLeft!.Y + node.Height);
        break;
      case O.Top:
        d = node.TopLeft!.Y - herd.Val;
        break;
      case O.Left:
        d = node.TopLeft!.X - herd.Val;
        break;
      case O.Right:
        d = herd.Val - (node.TopLeft!.X + node.Width);
        break;
    }
    if (d >= 0) totalDistance += d;
    else totalDistance -= d - node.Graph!.CellSize;
  }
  const siblings = node.Graph!.CommonUncleSiblings.get(node);
  if (siblings !== undefined) {
    const axisScore = AxisScore(siblings);
    const cost = includeSizes ? node.Graph!.CellSize : 1;
    totalDistance += cost * (1 - axisScore) * (siblings.length - 1);
  }
  checkScoringCancellation(ctx);
  if (includeSizes) totalDistance += flowContinuityCost(node, scratch);
  return totalDistance;
}
