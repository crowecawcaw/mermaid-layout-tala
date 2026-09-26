import type { Point, PositionedEdge } from '../layout.js';

/** Port of upstream quality.countNonSharedCrossings. */
export function countNonSharedCrossings(edges: readonly PositionedEdge[]): number {
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      crossings += countEdgeCrossings(edges[i]!, edges[j]!);
    }
  }
  return crossings;
}

function countEdgeCrossings(edge: PositionedEdge, other: PositionedEdge): number {
  let crossings = 0;
  for (let i = 0; i < edge.points.length - 1; i++) {
    for (let j = 0; j < other.points.length - 1; j++) {
      if (isNonSharedCrossing(edge, other, i, j)) crossings++;
    }
  }
  return crossings;
}

function isNonSharedCrossing(edge: PositionedEdge, other: PositionedEdge, edgeSegment: number, otherSegment: number): boolean {
  const a = edge.points[edgeSegment]!, b = edge.points[edgeSegment + 1]!;
  const c = other.points[otherSegment]!, d = other.points[otherSegment + 1]!;
  if (!nonParallelIntersection(a, b, c, d)) return false;
  if (a.x === b.x && (a.x === c.x || a.x === d.x)) return false;
  if (a.y === b.y && (a.y === c.y || a.y === d.y)) return false;
  return true;
}

function orientation(p: Point, q: Point, r: Point): number {
  const pqX = q.x - p.x, pqY = q.y - p.y;
  const prX = r.x - p.x, prY = r.y - p.y;
  return pqY * prX - pqX * prY;
}

function equalSigns(a: number, b: number): boolean {
  return a > 0 && b > 0 || a === 0 && b === 0 || a < 0 && b < 0;
}

function nonParallelIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const abc = orientation(a, b, c), abd = orientation(a, b, d);
  if (equalSigns(abc, abd)) return false;
  const cda = orientation(c, d, a), cdb = orientation(c, d, b);
  return !equalSigns(cda, cdb);
}
