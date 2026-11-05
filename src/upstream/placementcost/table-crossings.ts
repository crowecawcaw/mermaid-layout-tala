// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Orientation as O } from '../geo/orientation.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { CrossingCost } from '../layoutgraph/placement-cost.js';
import { scoringCancellationError } from './geometry.js';

export function addTableCrossingCosts(
  ctx: Context,
  node: Node,
  edge: Edge,
  replacement: Node,
  adjacent: Node,
  edgeDirection: O,
  distance: number,
): number {
  const columnIndex =
    edge.From === replacement
      ? edge.ToTableColumnIndex!
      : edge.FromTableColumnIndex!;
  for (let i = 0; i < adjacent.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    const otherEdge = adjacent.Edges[i]!;
    if (
      otherEdge.FromTableColumnIndex === null ||
      otherEdge.ToTableColumnIndex === null
    )
      continue;
    const otherTable = adjacent.Adjacent(otherEdge);
    const otherColumnIndex =
      otherEdge.From === otherTable
        ? otherEdge.ToTableColumnIndex
        : otherEdge.FromTableColumnIndex;
    const directionToOther = nodeOrientation(replacement, otherTable);
    const otherEdgeDirection = nodeOrientation(otherTable, adjacent);
    let sameSide = false;
    switch (edgeDirection) {
      case O.BottomRight:
      case O.Right:
      case O.TopRight:
        sameSide =
          otherEdgeDirection === O.BottomRight ||
          otherEdgeDirection === O.Right ||
          otherEdgeDirection === O.TopRight;
        break;
      case O.BottomLeft:
      case O.Left:
      case O.TopLeft:
        sameSide =
          otherEdgeDirection === O.BottomLeft ||
          otherEdgeDirection === O.Left ||
          otherEdgeDirection === O.TopLeft;
        break;
    }
    if (sameSide) {
      switch (directionToOther) {
        case O.TopRight:
        case O.Top:
        case O.TopLeft:
          if (otherColumnIndex < columnIndex)
            distance += CrossingCost(node.Graph!);
          break;
        case O.BottomRight:
        case O.Bottom:
        case O.BottomLeft:
          if (otherColumnIndex > columnIndex)
            distance += CrossingCost(node.Graph!);
          break;
      }
    }
  }
  return distance;
}
