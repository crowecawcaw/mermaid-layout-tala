// Translated from internal/routing/cost.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import { Route } from '../geo/route.js';
import type { Edge } from '../layoutgraph/edge.js';
import { CrossingCostWeight } from '../layoutgraph/geometry-policy.js';
import { orientation } from './geometry.js';
export function equalSigns(a: number, b: number): boolean {
  return (a > 0 && b > 0) || (a === 0 && b === 0) || (a < 0 && b < 0);
}
export function nonParallelIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  if (equalSigns(orientation(a, b, c), orientation(a, b, d))) return false;
  return !equalSigns(orientation(c, d, a), orientation(c, d, b));
}
export function isNonSharedCrossing(
  edge: Edge,
  other: Edge,
  i: number,
  j: number,
): boolean {
  const a = edge.Points[i]!,
    b = edge.Points[i + 1]!,
    c = other.Points[j]!,
    d = other.Points[j + 1]!;
  if (!nonParallelIntersection(a, b, c, d)) return false;
  if (a.X === b.X && (a.X === c.X || a.X === d.X)) return false;
  if (a.Y === b.Y && (a.Y === c.Y || a.Y === d.Y)) return false;
  return true;
}
export function countNonSharedCrossings(edge: Edge, other: Edge): number {
  let count = 0;
  for (let i = 0; i < edge.Points.length - 1; i++)
    for (let j = 0; j < other.Points.length - 1; j++)
      if (isNonSharedCrossing(edge, other, i, j)) count++;
  return count;
}
export function estimateRouteCost(edges: Edge[], edge: Edge): number {
  let cost = new Route(edge.Points).Length();
  cost *= Math.pow(1.4, edge.Points.length - 2);
  let crossings = 0;
  for (const other of edges)
    if (other !== edge) crossings += countNonSharedCrossings(edge, other);
  return cost + CrossingCostWeight * crossings;
}
