// Translated from internal/routing/edge_simplify.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Point } from '../geo/point.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { containsPoint } from '../layoutgraph/node-spatial.js';
import { intersects } from './geometry.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  runAtomicRouteStage,
} from './stage-guard.js';
export const isHorizontalSegment = (a: Point, b: Point): boolean => a.Y === b.Y;
export const isVerticalSegment = (a: Point, b: Point): boolean => a.X === b.X;
export function findIntersectionPoint(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  if (isHorizontalSegment(a, b) && isVerticalSegment(c, d))
    return new Point(d.X, a.Y);
  if (isVerticalSegment(a, b) && isHorizontalSegment(c, d))
    return new Point(a.X, d.Y);
  return null;
}
export function sameRouteDirection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  return (
    (b.X - a.X) * (d.X - c.X) + (b.Y - a.Y) * (d.Y - c.Y) > 0 &&
    (b.X - a.X) * (d.Y - c.Y) === (b.Y - a.Y) * (d.X - c.X)
  );
}
export function orthogonalSegmentEntersNode(
  node: Node,
  a: Point,
  b: Point,
): boolean {
  const left = node.TopLeft!.X + 1e-6,
    right = node.TopLeft!.X + node.Width - 1e-6,
    top = node.TopLeft!.Y + 1e-6,
    bottom = node.TopLeft!.Y + node.Height - 1e-6;
  if (a.Y === b.Y)
    return (
      top < a.Y &&
      a.Y < bottom &&
      Math.min(a.X, b.X) < right &&
      Math.max(a.X, b.X) > left
    );
  if (a.X === b.X)
    return (
      left < a.X &&
      a.X < right &&
      Math.min(a.Y, b.Y) < bottom &&
      Math.max(a.Y, b.Y) > top
    );
  return true;
}
export function lineIntersectsUnrelatedNode(
  g: Graph,
  edge: Edge,
  a: Point,
  b: Point,
  guard: RouteWorkGuard,
): boolean {
  for (const node of g.Nodes) {
    guard.Step();
    if (!node.TopLeft || node.Width <= 0 || node.Height <= 0) continue;
    if (
      node !== edge.From &&
      node !== edge.To &&
      (isDescendantOf(edge.From, node) || isDescendantOf(edge.To, node))
    )
      continue;
    if (orthogonalSegmentEntersNode(node, a, b)) return true;
  }
  return false;
}
export function lineIntersectsOtherEdges(
  g: Graph,
  current: Edge,
  a: Point,
  b: Point,
  guard: RouteWorkGuard,
): boolean {
  for (const edge of g.Edges) {
    guard.Step();
    if (edge === current || edge.Points.length < 2) continue;
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      if (intersects(a, b, edge.Points[i]!, edge.Points[i + 1]!)) return true;
    }
  }
  return false;
}
export function simplifyPoints(
  g: Graph,
  edge: Edge,
  guard: RouteWorkGuard,
): Point[] {
  const points = edge.Points;
  if (points.length < 5) {
    guard.Step();
    return points;
  }
  const result = [points[0]!];
  let i = 0;
  while (i < points.length - 4) {
    guard.Step();
    const p1 = points[i]!,
      p2 = points[i + 1]!,
      p3 = points[i + 2]!,
      p4 = points[i + 3]!,
      p5 = points[i + 4]!;
    const x1 = p2.X - p1.X,
      y1 = p2.Y - p1.Y,
      x2 = p3.X - p2.X,
      y2 = p3.Y - p2.Y,
      x3 = p4.X - p3.X,
      y3 = p4.Y - p3.Y,
      x4 = p5.X - p4.X,
      y4 = p5.Y - p4.Y;
    const h1 = isHorizontalSegment(p1, p2),
      v1 = isVerticalSegment(p1, p2),
      h2 = isHorizontalSegment(p2, p3),
      v2 = isVerticalSegment(p2, p3),
      h3 = isHorizontalSegment(p3, p4),
      v3 = isVerticalSegment(p3, p4),
      h4 = isHorizontalSegment(p4, p5),
      v4 = isVerticalSegment(p4, p5);
    const oppositeVerticals =
        v2 && v4 && ((y2 > 0 && y4 < 0) || (y2 < 0 && y4 > 0)),
      sameHorizontals = h1 && h3 && ((x1 > 0 && x3 > 0) || (x1 < 0 && x3 < 0));
    const oppositeHorizontals =
        h2 && h4 && ((x2 > 0 && x4 < 0) || (x2 < 0 && x4 > 0)),
      sameVerticals = v1 && v3 && ((y1 > 0 && y3 > 0) || (y1 < 0 && y3 < 0));
    const pattern =
      (oppositeVerticals && sameHorizontals) ||
      (oppositeHorizontals && sameVerticals);
    let intersection: Point | null = null,
      blocked = false;
    if (pattern) {
      intersection = findIntersectionPoint(p1, p2, p4, p5);
      blocked = intersection === null;
      if (intersection) {
        if (
          i === 0 &&
          containsPoint(edge.From, p1, 1) &&
          !sameRouteDirection(p1, p2, p1, intersection)
        )
          blocked = true;
        if (
          i + 4 === points.length - 1 &&
          containsPoint(edge.To, p5, 1) &&
          !sameRouteDirection(p4, p5, intersection, p5)
        )
          blocked = true;
        for (const [a, b] of [
          [p1, intersection],
          [intersection, p5],
        ] as [Point, Point][]) {
          const nodeBlocked = lineIntersectsUnrelatedNode(g, edge, a, b, guard);
          blocked = blocked || nodeBlocked;
          const edgeBlocked = lineIntersectsOtherEdges(g, edge, a, b, guard);
          blocked = blocked || edgeBlocked;
        }
      }
    }
    if (pattern && !blocked) {
      result.push(intersection!, p5);
      i += 4;
      break;
    } else {
      result.push(p2);
      i++;
    }
  }
  for (let j = i + 1; j < points.length; j++) {
    guard.Step();
    result.push(points[j]!);
  }
  return result;
}
export function SimplifyEdgeRoutes(
  ctx: Context,
  g: Graph,
  limit = MaxRouteStageWorkUnits,
): void {
  runAtomicRouteStage(ctx, 'SimplifyEdgeRoutes', g, [], limit, (guard) => {
    for (const edge of g.Edges) {
      guard.Step();
      let changed = true;
      while (changed) {
        const points = simplifyPoints(g, edge, guard);
        changed = points.length < edge.Points.length;
        if (changed) edge.Points = points;
      }
    }
  });
}
