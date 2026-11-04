// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Orientation as O, IsDiagonal } from '../geo/orientation.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { sizelessOrientation } from './geometry.js';
import {
  calculateHorizontalMidpoint,
  calculateVerticalMidpoint,
} from './midpoint.js';

export interface EdgeRouteGeometry {
  direction: O;
  nodeVal: Point;
  adjacentNodeVal: Point;
  isDiagonal: boolean;
  isSemiDiagonal: boolean;
}
export function edgeRouteGeometry(
  node: Node,
  adjacent: Node,
  includeSizes: boolean,
): EdgeRouteGeometry | null {
  const direction = includeSizes
    ? nodeOrientation(node, adjacent)
    : sizelessOrientation(node, adjacent);
  if (!includeSizes)
    return {
      direction,
      nodeVal: node.TopLeft!,
      adjacentNodeVal: adjacent.TopLeft!,
      isDiagonal: false,
      isSemiDiagonal: false,
    };
  if (direction === O.NONE) return null;
  let isDiagonal = IsDiagonal(direction),
    isSemiDiagonal = false;
  let nodeVal: Point, adjacentNodeVal: Point;
  switch (direction) {
    case O.Top: {
      const [mid, semi] = calculateHorizontalMidpoint(node, adjacent);
      nodeVal = new Point(mid, node.TopLeft!.Y + node.Height);
      adjacentNodeVal = new Point(mid, adjacent.TopLeft!.Y);
      isSemiDiagonal = semi;
      break;
    }
    case O.Bottom: {
      const [mid, semi] = calculateHorizontalMidpoint(node, adjacent);
      nodeVal = new Point(mid, node.TopLeft!.Y);
      adjacentNodeVal = new Point(mid, adjacent.TopLeft!.Y + adjacent.Height);
      isSemiDiagonal = semi;
      break;
    }
    case O.Left: {
      const [mid, semi] = calculateVerticalMidpoint(node, adjacent);
      nodeVal = new Point(node.TopLeft!.X + node.Width, mid);
      adjacentNodeVal = new Point(adjacent.TopLeft!.X, mid);
      isSemiDiagonal = semi;
      break;
    }
    case O.Right: {
      const [mid, semi] = calculateVerticalMidpoint(node, adjacent);
      nodeVal = new Point(node.TopLeft!.X, mid);
      adjacentNodeVal = new Point(adjacent.TopLeft!.X + adjacent.Width, mid);
      isSemiDiagonal = semi;
      break;
    }
    default:
      nodeVal = node.Center();
      adjacentNodeVal = adjacent.Center();
  }
  if (node.Cluster !== null || adjacent.Cluster !== null) {
    isDiagonal = false;
    isSemiDiagonal = false;
    const center = node.Center(),
      other = adjacent.Center();
    switch (direction) {
      case O.Top:
      case O.TopLeft:
      case O.TopRight:
        nodeVal = new Point(center.X, node.TopLeft!.Y + node.Height);
        adjacentNodeVal = new Point(other.X, adjacent.TopLeft!.Y);
        break;
      case O.Bottom:
      case O.BottomLeft:
      case O.BottomRight:
        nodeVal = new Point(center.X, node.TopLeft!.Y);
        adjacentNodeVal = new Point(
          other.X,
          adjacent.TopLeft!.Y + adjacent.Height,
        );
        break;
      case O.Left:
        nodeVal = new Point(node.TopLeft!.X + node.Width, center.Y);
        adjacentNodeVal = new Point(adjacent.TopLeft!.X, other.Y);
        break;
      case O.Right:
        nodeVal = new Point(node.TopLeft!.X, center.Y);
        adjacentNodeVal = new Point(
          adjacent.TopLeft!.X + adjacent.Width,
          other.Y,
        );
        break;
    }
  }
  return { direction, nodeVal, adjacentNodeVal, isDiagonal, isSemiDiagonal };
}
