// Translated from internal/routing/swap_ports.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { Orientation as O, IsVertical } from '../geo/orientation.js';
import { Sign } from '../geo/math.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { PointMap } from './point-map.js';
import { segmentIntersectsBox } from './geometry.js';
import type { RouteWorkGuard } from './stage-guard.js';
export function pointsAt(e: Edge, n: Node): [Point, Point, Point] {
  const p = e.Points;
  return e.From === n
    ? [p[0]!, p[1]!, p[2]!]
    : [p[p.length - 1]!, p[p.length - 2]!, p[p.length - 3]!];
}
export function swapCoordinate(p: Point, q: Point, o: O): void {
  if (IsVertical(o)) [p.X, q.X] = [q.X, p.X];
  else [p.Y, q.Y] = [q.Y, p.Y];
}
export function doesNotPassThroughNodesGuarded(
  g: Graph,
  ns: Node[],
  p1: Point,
  p2: Point,
  q1: Point,
  q2: Point,
  guard: RouteWorkGuard,
): boolean {
  outer: for (const node of g.Nodes) {
    guard.Step();
    for (const n of ns) {
      guard.Step();
      if (node === n || isDescendantOf(n, node)) continue outer;
    }
    const box = new Box(
      new Point(node.TopLeft!.X - 10, node.TopLeft!.Y - 10),
      node.Width + 20,
      node.Height + 20,
    );
    if (segmentIntersectsBox(p1, p2, box) || segmentIntersectsBox(q1, q2, box))
      return false;
  }
  return true;
}
export function edgesIntersect(e1: Edge, e2: Edge, n: Node, o: O): boolean {
  const [p1, p2, p3] = pointsAt(e1, n),
    [q1, q2, q3] = pointsAt(e2, n);
  switch (o) {
    case O.Left:
      return (q2.X < p2.X && p3.Y > q1.Y) || (p2.X < q2.X && q3.Y < p1.Y);
    case O.Bottom:
      return (p2.Y > q2.Y && q3.X < p1.X) || (q2.Y > p2.Y && p3.X > q1.X);
    case O.Top:
      return (p2.Y < q2.Y && q3.X < p1.X) || (q2.Y < p2.Y && p3.X > q1.X);
    case O.Right:
      return (p2.X > q2.X && q3.Y < p1.Y) || (q2.X > p2.X && p3.Y > q1.Y);
    default:
      return false;
  }
}
export function canSwapPorts(
  e1: Edge,
  e2: Edge,
  n: Node,
  ports: PointMap<Edge[]>,
): boolean {
  const [p1] = pointsAt(e1, n),
    [p2] = pointsAt(e2, n);
  if ((ports.get(p1)?.length ?? 0) === 1 && (ports.get(p2)?.length ?? 0) === 1)
    return true;
  return e1.ArrowheadTo(n) === e2.ArrowheadTo(n);
}
export function sToLShapedBendPoint(p: Point[]): Point {
  return p[0]!.X === p[1]!.X
    ? new Point(p[1]!.X, p[3]!.Y)
    : new Point(p[3]!.X, p[1]!.Y);
}
export function isUShaped(p: Point[]): boolean {
  if (p.length !== 4) return false;
  if (p[0]!.X === p[1]!.X)
    return (
      Sign(p[0]!.Y - p[1]!.Y) === Sign(p[3]!.Y - p[2]!.Y) && p[1]!.Y === p[2]!.Y
    );
  return (
    Sign(p[0]!.X - p[1]!.X) === Sign(p[3]!.X - p[2]!.X) && p[1]!.X === p[2]!.X
  );
}
export function isSShaped(p: Point[]): boolean {
  return p.length === 4 && !isUShaped(p);
}
export function isLShaped(p: Point[]): boolean {
  if (p.length !== 3) return false;
  const vertical = p[0]!.X === p[1]!.X,
    horizontal = p[1]!.Y === p[2]!.Y;
  return (vertical && horizontal) || (!vertical && !horizontal);
}
export function swapPoints(p: Point, q: Point): void {
  [p.X, q.X] = [q.X, p.X];
  [p.Y, q.Y] = [q.Y, p.Y];
}
export function copyEdgePointsGuarded(
  edge: Edge,
  guard: RouteWorkGuard,
): Point[] {
  const result: Point[] = [];
  for (const p of edge.Points) {
    guard.Step();
    result.push(p.Copy());
  }
  return result;
}
export function insertEdgePointGuarded(
  edge: Edge,
  point: Point,
  index: number,
  guard: RouteWorkGuard,
): void {
  if (index < 0 || index > edge.Points.length)
    throw new Error(
      `TALA ${guard.location} route insertion index ${index} is out of bounds`,
    );
  const points: Point[] = [];
  for (let i = 0; i < edge.Points.length; i++) {
    guard.Step();
    if (i === index) points.push(point);
    points.push(edge.Points[i]!);
  }
  if (index === edge.Points.length) points.push(point);
  edge.Points = points;
}
export function removeEdgePointsGuarded(
  edge: Edge,
  guard: RouteWorkGuard,
  ...indices: number[]
): void {
  if (edge.Points.length - indices.length < 0)
    throw new Error(
      `TALA ${guard.location} route removal count exceeds route length`,
    );
  const points: Point[] = [];
  outer: for (let i = 0; i < edge.Points.length; i++) {
    guard.Step();
    for (const index of indices) {
      guard.Step();
      if (i === index) continue outer;
    }
    points.push(edge.Points[i]!);
  }
  edge.Points = points;
}
