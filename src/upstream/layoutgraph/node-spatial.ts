// Translated spatial predicates from internal/layoutgraph/node.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { EuclideanDistance } from '../geo/math.js';
import { Orientation } from '../geo/orientation.js';
import { Kind } from '../nodeshape/kind.js';
import { MinRouteNodeClearance } from './geometry-policy.js';
import { deltaToGuarded } from './node-spacing.js';
export function covers(b1: Box, b2: Box): boolean {
  return (
    b2.TopLeft!.X >= b1.TopLeft!.X &&
    b2.TopLeft!.Y >= b1.TopLeft!.Y &&
    b2.TopLeft!.X + b2.Width <= b1.TopLeft!.X + b1.Width &&
    b2.TopLeft!.Y + b2.Height <= b1.TopLeft!.Y + b1.Height
  );
}
export function doesOverlapCalc(n1: Node, n2: Node, delta: number): boolean {
  return boxesOverlapWithPadding(n1.Box, n2.Box, delta);
}
export function boxesOverlapWithPadding(
  b1: Box,
  b2: Box,
  padding: number,
): boolean {
  let b1Right = b1.TopLeft!.X + b1.Width;
  let b2Right = b2.TopLeft!.X + b2.Width;
  if (
    b1.TopLeft!.X >= b2Right + padding ||
    b2.TopLeft!.X >= b1Right + padding
  ) {
    return false;
  }

  let b1Bottom = b1.TopLeft!.Y + b1.Height;
  let b2Bottom = b2.TopLeft!.Y + b2.Height;
  return (
    b1.TopLeft!.Y < b2Bottom + padding && b2.TopLeft!.Y < b1Bottom + padding
  );
}
export function DoesOverlapExact(n1: Node, n2: Node): boolean {
  return doesOverlapCalc(n1, n2, 0);
}
export function doesOverlapAt(n1: Node, n2: Node, p: Point): boolean {
  let delta = deltaToGuarded(n1, n2, p, null);
  let b1 = new Box(p, n1.Width, n1.Height);
  return boxesOverlapWithPadding(b1, n2.Box, delta);
}
export function doesOverlap(n1: Node, n2: Node): boolean {
  let delta = deltaToGuarded(n1, n2, n1.TopLeft, null);
  return doesOverlapCalc(n1, n2, delta);
}
export function overlapArea(node: Node, otherNode: Node): number {
  let xs: number[] = [],
    ys: number[] = [];

  xs.push(node.TopLeft!.X);
  xs.push(node.TopLeft!.X + node.Width);
  ys.push(node.TopLeft!.Y);
  ys.push(node.TopLeft!.Y + node.Height);

  xs.push(otherNode.TopLeft!.X);
  xs.push(otherNode.TopLeft!.X + otherNode.Width);
  ys.push(otherNode.TopLeft!.Y);
  ys.push(otherNode.TopLeft!.Y + otherNode.Height);

  xs.sort(compareFloat);
  ys.sort(compareFloat);

  let width = xs[2]! - xs[1]!;
  let height = ys[2]! - ys[1]!;

  return width * height;
}
export function isPointNear(node: Node, point: Point): boolean {
  return (
    node.TopLeft!.X - MinRouteNodeClearance <= point.X &&
    node.TopLeft!.X + node.Width + MinRouteNodeClearance >= point.X &&
    node.TopLeft!.Y - MinRouteNodeClearance <= point.Y &&
    node.TopLeft!.Y + node.Height + MinRouteNodeClearance >= point.Y
  );
}
export function isPointOnNode(node: Node, point: Point): boolean {
  return (
    node.TopLeft!.X <= point.X &&
    node.TopLeft!.X + node.Width >= point.X &&
    node.TopLeft!.Y <= point.Y &&
    node.TopLeft!.Y + node.Height >= point.Y
  );
}
export function distanceTo(
  nodeA: Node,
  nodeB: Node,
  includeSizes: boolean,
): number {
  return distanceBetweenBoxes(
    nodeDistanceBox(nodeA, includeSizes),
    nodeDistanceBox(nodeB, includeSizes),
  );
}
export function nodeDistanceBox(node: Node, includeSize: boolean): Box {
  return new Box(
    node.TopLeft!,
    includeSize ? node.Width : 0,
    includeSize ? node.Height : 0,
  );
}
export function distanceBetweenBoxes(b1: Box, b2: Box): number {
  let dx = intervalGap(
    b1.TopLeft!.X,
    b1.TopLeft!.X + b1.Width,
    b2.TopLeft!.X,
    b2.TopLeft!.X + b2.Width,
  );
  let dy = intervalGap(
    b1.TopLeft!.Y,
    b1.TopLeft!.Y + b1.Height,
    b2.TopLeft!.Y,
    b2.TopLeft!.Y + b2.Height,
  );
  return EuclideanDistance(0, 0, dx, dy);
}
export function intervalGap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  if (aEnd < bStart) {
    return bStart - aEnd;
  }
  if (bEnd < aStart) {
    return aStart - bEnd;
  }
  return 0;
}
export function isAdjacentTo(
  nodeA: Node,
  nodeB: Node,
  includeSizes: boolean,
): boolean {
  let d = distanceTo(nodeA, nodeB, includeSizes);
  if (includeSizes) {
    if (d <= nodeA.Graph!.CellSize) {
      return true;
    }
  } else {
    if (d <= 1.0) {
      return true;
    }
  }
  return false;
}
export function isWithinBounds(node: Node, tl: Point, br: Point): boolean {
  if (node.TopLeft!.X > br.X) {
    return false;
  }
  if (node.TopLeft!.Y > br.Y) {
    return false;
  }
  if (node.TopLeft!.X + node.Width < tl.X) {
    return false;
  }
  if (node.TopLeft!.Y + node.Height < tl.Y) {
    return false;
  }

  return true;
}
export function distanceBetweenCenters(
  nodeA: Node,
  nodeB: Node,
  includeSizes: boolean,
): number {
  let c = 1.0 / 20.0;

  let xCenter = Math.abs(nodeA.TopLeft!.X - nodeB.TopLeft!.X);
  let yCenter = Math.abs(nodeA.TopLeft!.Y - nodeB.TopLeft!.Y);

  if (includeSizes) {
    let nodeAWidth = nodeA.Width;
    let nodeAHeight = nodeA.Height;
    let nodeBWidth = nodeB.Width;
    let nodeBHeight = nodeB.Height;

    xCenter =
      Math.abs(
        nodeA.TopLeft!.X + nodeAWidth / 2 - (nodeB.TopLeft!.X + nodeBWidth / 2),
      ) /
      (nodeAWidth + nodeBWidth);
    yCenter =
      Math.abs(
        nodeA.TopLeft!.Y +
          nodeAHeight / 2 -
          (nodeB.TopLeft!.Y + nodeBHeight / 2),
      ) /
      (nodeAHeight + nodeBHeight);
  }

  return c * Math.min(xCenter, yCenter);
}
export function IsBlocked(
  node: Node,
  nodeA: Node,
  nodeB: Node,
  includeSizes: boolean,
  isHorizontal: boolean,
): boolean {
  if (isHorizontal) {
    if (includeSizes) {
      if (!(
        node.TopLeft!.X >= nodeA.TopLeft!.X + nodeA.Width &&
        node.TopLeft!.X + node.Width <= nodeB.TopLeft!.X
      )) {
        return false;
      }
    } else {
      if (!(
        node.TopLeft!.X >= nodeA.TopLeft!.X &&
        node.TopLeft!.X <= nodeB.TopLeft!.X
      )) {
        return false;
      }
    }
  } else {
    if (includeSizes) {
      if (!(
        node.TopLeft!.Y >= nodeA.TopLeft!.Y + nodeA.Height &&
        node.TopLeft!.Y + node.Height <= nodeB.TopLeft!.Y
      )) {
        return false;
      }
    } else {
      if (!(
        node.TopLeft!.Y >= nodeA.TopLeft!.Y &&
        node.TopLeft!.Y <= nodeB.TopLeft!.Y
      )) {
        return false;
      }
    }
  }

  if (isHorizontal) {
    if (includeSizes) {
      if (
        node.TopLeft!.Y <= Math.max(nodeA.TopLeft!.Y, nodeB.TopLeft!.Y) &&
        node.TopLeft!.Y + node.Height >=
          Math.min(
            nodeA.TopLeft!.Y + nodeA.Height,
            nodeB.TopLeft!.Y + nodeB.Height,
          )
      ) {
        return true;
      }
    } else {
      if (
        node.TopLeft!.Y <= Math.max(nodeA.TopLeft!.Y, nodeB.TopLeft!.Y) &&
        node.TopLeft!.Y >= Math.min(nodeA.TopLeft!.Y, nodeB.TopLeft!.Y)
      ) {
        return true;
      }
    }
  } else {
    if (includeSizes) {
      if (
        node.TopLeft!.X <= Math.max(nodeA.TopLeft!.X, nodeB.TopLeft!.X) &&
        node.TopLeft!.X + node.Width >=
          Math.min(
            nodeA.TopLeft!.X + nodeA.Width,
            nodeB.TopLeft!.X + nodeB.Width,
          )
      ) {
        return true;
      }
    } else {
      if (
        node.TopLeft!.X <= Math.max(nodeA.TopLeft!.X, nodeB.TopLeft!.X) &&
        node.TopLeft!.X >= Math.min(nodeA.TopLeft!.X, nodeB.TopLeft!.X)
      ) {
        return true;
      }
    }
  }

  return false;
}
export function distance(
  nodeA: Node,
  nodeB: Node,
  includeSizes: boolean,
): number {
  return (
    distanceTo(nodeA, nodeB, includeSizes) +
    distanceBetweenCenters(nodeA, nodeB, includeSizes)
  );
}
export function orthogonalDistanceTo(
  nodeA: Node,
  nodeB: Node,
): [number, number] {
  let x = 0,
    y = 0;
  let rightA = nodeA.TopLeft!.X + nodeA.Width;
  let bottomA = nodeA.TopLeft!.Y + nodeA.Height;
  let rightB = nodeB.TopLeft!.X + nodeB.Width;
  let bottomB = nodeB.TopLeft!.Y + nodeB.Height;

  if (nodeA.TopLeft!.X < nodeB.TopLeft!.X) {
    x = Math.max(0, nodeB.TopLeft!.X - rightA);
  } else {
    x = Math.max(0, nodeA.TopLeft!.X - rightB);
  }

  if (nodeA.TopLeft!.Y < nodeB.TopLeft!.Y) {
    y = Math.max(0, nodeB.TopLeft!.Y - bottomA);
  } else {
    y = Math.max(0, nodeA.TopLeft!.Y - bottomB);
  }

  return [x, y];
}
export function overlapsAlongDimension(
  n1: Node,
  n2: Node,
  isHorizontal: boolean,
  includeSizes: boolean,
): boolean {
  if (isHorizontal) {
    if (includeSizes) {
      if (n1.TopLeft!.Y > n2.TopLeft!.Y + n2.Height) {
        return false;
      }
      if (n1.TopLeft!.Y + n1.Height < n2.TopLeft!.Y) {
        return false;
      }
    } else {
      if (n1.TopLeft!.Y > n2.TopLeft!.Y) {
        return false;
      }
      if (n1.TopLeft!.Y < n2.TopLeft!.Y) {
        return false;
      }
    }
  } else {
    if (includeSizes) {
      if (n1.TopLeft!.X > n2.TopLeft!.X + n2.Width) {
        return false;
      }
      if (n1.TopLeft!.X + n1.Width < n2.TopLeft!.X) {
        return false;
      }
    } else {
      if (n1.TopLeft!.X > n2.TopLeft!.X) {
        return false;
      }
      if (n1.TopLeft!.X < n2.TopLeft!.X) {
        return false;
      }
    }
  }
  return true;
}
export function isVisibilityGraphCandidate(
  node: Node,
  isHorizontal: boolean,
  checkSide: boolean,
  includeSizes: boolean,
  otherNode: Node,
  padding: number,
): boolean {
  if (isHorizontal) {
    if (checkSide && node.TopLeft!.X >= otherNode.TopLeft!.X) {
      return false;
    }
    if (includeSizes) {
      if (node.TopLeft!.Y > otherNode.TopLeft!.Y + otherNode.Height + padding) {
        return false;
      }
      if (node.TopLeft!.Y + node.Height + padding < otherNode.TopLeft!.Y) {
        return false;
      }
    } else {
      if (node.TopLeft!.Y > otherNode.TopLeft!.Y) {
        return false;
      }
      if (node.TopLeft!.Y < otherNode.TopLeft!.Y) {
        return false;
      }
    }
  } else {
    if (checkSide && node.TopLeft!.Y >= otherNode.TopLeft!.Y) {
      return false;
    }
    if (includeSizes) {
      if (node.TopLeft!.X > otherNode.TopLeft!.X + otherNode.Width + padding) {
        return false;
      }
      if (node.TopLeft!.X + node.Width + padding < otherNode.TopLeft!.X) {
        return false;
      }
    } else {
      if (node.TopLeft!.X > otherNode.TopLeft!.X) {
        return false;
      }
      if (node.TopLeft!.X < otherNode.TopLeft!.X) {
        return false;
      }
    }
  }

  return true;
}
export function passesThrough(node: Node, p1: Point, p2: Point): boolean {
  return segmentIntersectsBox(p1, p2, node.Box);
}
export function segmentIntersectsBox(p1: Point, p2: Point, box: Box): boolean {
  if (p1 == null || p2 == null || box == null || box.TopLeft == null) {
    return false;
  }

  let [left, right] = [box.TopLeft!.X, box.TopLeft!.X + box.Width];
  if (left > right) {
    [left, right] = [right, left];
  }
  let [top, bottom] = [box.TopLeft!.Y, box.TopLeft!.Y + box.Height];
  if (top > bottom) {
    [top, bottom] = [bottom, top];
  }

  if (left != left || right != right || top != top || bottom != bottom) {
    return false;
  }

  if (
    (p1.X < left && p2.X < left) ||
    (p1.X > right && p2.X > right) ||
    (p1.Y < top && p2.Y < top) ||
    (p1.Y > bottom && p2.Y > bottom)
  ) {
    return false;
  }

  const contains = (p: Point): boolean => {
    return left <= p.X && p.X <= right && top <= p.Y && p.Y <= bottom;
  };
  if (contains(p1) || contains(p2)) {
    return true;
  }

  let [tEnter, tExit] = [0.0, 1.0];
  const clipAxis = (
    start: number,
    delta: number,
    minCoord: number,
    maxCoord: number,
  ): boolean => {
    if (delta == 0) {
      return minCoord <= start && start <= maxCoord;
    }
    let t1 = (minCoord - start) / delta;
    let t2 = (maxCoord - start) / delta;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }
    tEnter = Math.max(tEnter, t1);
    tExit = Math.min(tExit, t2);
    return tEnter <= tExit;
  };

  if (
    !clipAxis(p1.X, p2.X - p1.X, left, right) ||
    !clipAxis(p1.Y, p2.Y - p1.Y, top, bottom)
  ) {
    return false;
  }
  return tEnter < tExit;
}
export function orientation(p: Point, q: Point, r: Point): number {
  let pqX = q.X - p.X;
  let pqY = q.Y - p.Y;
  let prX = r.X - p.X;
  let prY = r.Y - p.Y;
  return pqY * prX - pqX * prY;
}
export function intersects(
  p1: Point,
  q1: Point,
  p2: Point,
  q2: Point,
): boolean {
  let p2Side = orientation(p1, q1, p2);
  let q2Side = orientation(p1, q1, q2);
  let p1Side = orientation(p2, q2, p1);
  let q1Side = orientation(p2, q2, q1);

  if (p2Side == 0 && q2Side == 0 && p1Side == 0 && q1Side == 0) {
    return (
      closedIntervalsOverlap(p1.X, q1.X, p2.X, q2.X) &&
      closedIntervalsOverlap(p1.Y, q1.Y, p2.Y, q2.Y)
    );
  }

  return straddlesLine(p2Side, q2Side) && straddlesLine(p1Side, q1Side);
}
export function straddlesLine(side1: number, side2: number): boolean {
  return side1 == 0 || side2 == 0 || side1 < 0 != side2 < 0;
}
export function closedIntervalsOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
): boolean {
  let [aMin, aMax] = [Math.min(a1, a2), Math.max(a1, a2)];
  let [bMin, bMax] = [Math.min(b1, b2), Math.max(b1, b2)];
  return aMin <= bMax && bMin <= aMax;
}
export function containsPoint(node: Node, p: Point, delta: number): boolean {
  return (
    node.TopLeft!.X - delta <= p.X &&
    node.TopLeft!.X + node.Width + delta >= p.X &&
    node.TopLeft!.Y - delta <= p.Y &&
    node.TopLeft!.Y + node.Height + delta >= p.Y
  );
}
export function overlapsLine(
  node: Node,
  p1: Point,
  p2: Point,
  delta: number,
): boolean {
  if (containsPoint(node, p1, delta) || containsPoint(node, p2, delta)) {
    return true;
  }

  let l = node.TopLeft!.X - delta;
  let r = node.TopLeft!.X + node.Width + delta;
  let t = node.TopLeft!.Y - delta;
  let b = node.TopLeft!.Y + node.Height + delta;

  let tl = new Point(l, t);
  let br = new Point(r, b);
  let tr = new Point(r, t);
  let bl = new Point(l, b);

  return (
    intersects(tl, tr, p1, p2) ||
    intersects(tr, br, p1, p2) ||
    intersects(br, bl, p1, p2) ||
    intersects(bl, tl, p1, p2)
  );
}
export function Surrounds(
  node: Node,
  other: Node,
  withPadding: number,
): boolean {
  if (node == null) {
    return true;
  }
  return (
    node.TopLeft!.X + withPadding < other.TopLeft!.X &&
    node.TopLeft!.X + node.Width - withPadding >
      other.TopLeft!.X + other.Width &&
    node.TopLeft!.Y + withPadding < other.TopLeft!.Y &&
    node.TopLeft!.Y + node.Height - withPadding >
      other.TopLeft!.Y + other.Height
  );
}
export function nodeOrientation(node: Node, otherNode: Node): Orientation {
  if (node.TopLeft == null || otherNode.TopLeft == null) {
    return Orientation.NONE;
  }
  if (node.TopLeft!.Y + node.Height < otherNode.TopLeft!.Y) {
    if (node.TopLeft!.X + node.Width < otherNode.TopLeft!.X) {
      return Orientation.TopLeft;
    }
    if (otherNode.TopLeft!.X + otherNode.Width < node.TopLeft!.X) {
      return Orientation.TopRight;
    }
    return Orientation.Top;
  }

  if (otherNode.TopLeft!.Y + otherNode.Height < node.TopLeft!.Y) {
    if (node.TopLeft!.X + node.Width < otherNode.TopLeft!.X) {
      return Orientation.BottomLeft;
    }
    if (otherNode.TopLeft!.X + otherNode.Width < node.TopLeft!.X) {
      return Orientation.BottomRight;
    }
    return Orientation.Bottom;
  }

  if (otherNode.TopLeft!.X + otherNode.Width < node.TopLeft!.X) {
    return Orientation.Right;
  }

  if (node.TopLeft!.X + node.Width < otherNode.TopLeft!.X) {
    return Orientation.Left;
  }

  return Orientation.NONE;
}
export function orientationAtPoint(
  node: Node,
  otherNode: Node,
  point: Point,
): Orientation {
  if (point == null || otherNode.TopLeft == null) {
    return Orientation.NONE;
  }

  if (point.Y + node.Height < otherNode.TopLeft!.Y) {
    if (point.X + node.Width < otherNode.TopLeft!.X) {
      return Orientation.TopLeft;
    }
    if (otherNode.TopLeft!.X + otherNode.Width < point.X) {
      return Orientation.TopRight;
    }
    return Orientation.Top;
  }

  if (otherNode.TopLeft!.Y + otherNode.Height < point.Y) {
    if (point.X + node.Width < otherNode.TopLeft!.X) {
      return Orientation.BottomLeft;
    }
    if (otherNode.TopLeft!.X + otherNode.Width < point.X) {
      return Orientation.BottomRight;
    }
    return Orientation.Bottom;
  }

  if (otherNode.TopLeft!.X + otherNode.Width < point.X) {
    return Orientation.Right;
  }

  if (point.X + node.Width < otherNode.TopLeft!.X) {
    return Orientation.Left;
  }

  return Orientation.NONE;
}
export function modifierElementAdjustments(n: Node): [number, number] {
  let dx = 0,
    dy = 0;
  if (n.Is3D) {
    if (n.shapeType == Kind.Hexagon) {
      dy = 15 / 2;
    } else {
      dy = 15;
    }
    dx = 15;
  } else if (n.IsMultiple) {
    dy = 10;
    dx = 10;
  }
  return [dx, dy];
}

function compareFloat(a: number, b: number): number {
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : -1;
  if (Number.isNaN(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
