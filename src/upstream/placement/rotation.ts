// Translated internal/placement/transpose.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Round } from '../geo/math.js';
import { moveNodeAbsWithChildren } from '../layoutgraph/containment.js';
import { roundToNearestCellSize } from './types.js';
export function rotateAround(
  node: Node,
  graph: Graph,
  center: Node,
  times: number,
  round: boolean,
): void {
  for (let i = 0; i < times; i++) {
    const c = node.Center();
    const translatedX = c.X - center.TopLeft!.X - center.Width / 2,
      translatedY = c.Y - center.TopLeft!.Y - center.Height / 2;
    const rotatedX = -translatedY,
      rotatedY = translatedX,
      newCenterX = rotatedX + center.TopLeft!.X + center.Width / 2,
      newCenterY = rotatedY + center.TopLeft!.Y + center.Height / 2;
    let x = Round(newCenterX - node.Width / 2),
      y = Round(newCenterY - node.Height / 2);
    if (round) {
      if (Math.trunc(graph.CellSize) === 0)
        throw new Error('integer divide by zero');
      if (Math.trunc(x) % Math.trunc(graph.CellSize) !== 0)
        x = roundToNearestCellSize(x, graph.CellSize);
      if (Math.trunc(y) % Math.trunc(graph.CellSize) !== 0)
        y = roundToNearestCellSize(y, graph.CellSize);
    }
    moveNodeAbsWithChildren(node, x, y);
  }
}
