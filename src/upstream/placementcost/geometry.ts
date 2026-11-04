// Translated internal/placementcost/geometry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { EuclideanDistance } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import {
  distanceTo,
  distanceBetweenBoxes,
} from '../layoutgraph/node-spatial.js';
import { nodesBoundingBox } from '../layoutgraph/node-geometry.js';
import { facingTablePorts } from '../layoutgraph/ports.js';
export const scoringCancellationCheckInterval = 64,
  sizelessDirectionDeltaFactor = 0.25,
  symmetryToleranceBand = 1,
  SideEdgeSpacing = 40,
  IdealGapSize = 150;
export function checkScoringCancellation(ctx: Context): void {
  const error = ctx.Err();
  if (error !== null)
    throw new Error(`EdgeLength: ${error.message}`, { cause: error });
}
export function scoringCancellationError(
  ctx: Context,
  iteration: number,
): void {
  if (iteration % scoringCancellationCheckInterval !== 0) return;
  checkScoringCancellation(ctx);
}
export function directionCompass(o: O): number {
  switch (o) {
    case O.BottomLeft:
      return -3;
    case O.Left:
      return -2;
    case O.TopLeft:
      return -1;
    case O.Top:
      return 0;
    case O.TopRight:
      return 1;
    case O.Right:
      return 2;
    case O.BottomRight:
      return 3;
    case O.Bottom:
      return 4;
    default:
      return 0;
  }
}
export function compassDelta(first: number, second: number): number {
  let delta = second - first;
  if (delta > 4) delta -= 8;
  else if (delta < -4) delta += 8;
  return delta;
}
export function compassAxisDelta(first: number, second: number): number {
  first = (first + 4) % 4;
  second = (second + 4) % 4;
  const delta = second - first;
  return delta === 3 ? -1 : delta;
}
export function distanceToPoint(
  node: Node,
  point: Point,
  includeSizes: boolean,
): number {
  return distanceBetweenBoxes(
    new Box(
      node.TopLeft!,
      includeSizes ? node.Width : 0,
      includeSizes ? node.Height : 0,
    ),
    new Box(point, 0, 0),
  );
}
export function placementDistance(
  first: Node,
  second: Node,
  includeSizes: boolean,
): number {
  const d = distanceTo(first, second, includeSizes);
  let xCenter = Math.abs(first.TopLeft!.X - second.TopLeft!.X),
    yCenter = Math.abs(first.TopLeft!.Y - second.TopLeft!.Y);
  if (includeSizes) {
    xCenter =
      Math.abs(
        first.TopLeft!.X +
          first.Width / 2 -
          (second.TopLeft!.X + second.Width / 2),
      ) /
      (first.Width + second.Width);
    yCenter =
      Math.abs(
        first.TopLeft!.Y +
          first.Height / 2 -
          (second.TopLeft!.Y + second.Height / 2),
      ) /
      (first.Height + second.Height);
  }
  return d + Math.min(xCenter, yCenter) / 20;
}
export function sizelessOrientation(node: Node, other: Node): O {
  if (node.TopLeft === null || other.TopLeft === null) return O.NONE;
  if (node.TopLeft.Y < other.TopLeft.Y) {
    if (node.TopLeft.X < other.TopLeft.X) return O.TopLeft;
    if (other.TopLeft.X < node.TopLeft.X) return O.TopRight;
    return O.Top;
  }
  if (other.TopLeft.Y < node.TopLeft.Y) {
    if (node.TopLeft.X < other.TopLeft.X) return O.BottomLeft;
    if (other.TopLeft.X < node.TopLeft.X) return O.BottomRight;
    return O.Bottom;
  }
  if (other.TopLeft.X < node.TopLeft.X) return O.Right;
  if (node.TopLeft.X < other.TopLeft.X) return O.Left;
  return O.NONE;
}
export function depth(node: Node | null): number {
  return node === null ? 0 : 1 + depth(node.Container);
}
export function distanceBetweenTableColumns(
  graph: Graph,
  edge: Edge,
  from: Node | null,
  to: Node | null,
): number {
  let {
    from: fromPort,
    to: toPort,
    hasFrom,
    hasTo,
    orientation,
  } = facingTablePorts(edge, from, to);
  if (orientation === O.NONE) {
    from ??= edge.From;
    to ??= edge.To;
    const [tl, br] = nodesBoundingBox([from, to], true);
    return 2 * EuclideanDistance(tl!.X, tl!.Y, br!.X, br!.Y);
  }
  let multiplier = 2;
  if (orientation === O.Left || orientation === O.Right) multiplier = 1;
  if (!hasFrom)
    fromPort = new Point(
      from!.TopLeft!.X + from!.Width / 2,
      from!.TopLeft!.Y + from!.Height / 2,
    );
  if (!hasTo)
    toPort = new Point(
      to!.TopLeft!.X + to!.Width / 2,
      to!.TopLeft!.Y + to!.Height / 2,
    );
  let gapCost = 0;
  if (Math.abs(fromPort.X - toPort.X) < IdealGapSize)
    gapCost = 2 * graph.CellSize;
  return (
    multiplier *
    (gapCost + EuclideanDistance(fromPort.X, fromPort.Y, toPort.X, toPort.Y))
  );
}
