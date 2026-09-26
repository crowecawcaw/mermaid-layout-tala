import type { Point, PositionedEdge } from '../layout.js';
import type { TalaGraph } from './graph.js';

/** Port of placementcost.GraphEdgeCrossings for placement's straight center rays. */
export function countGraphEdgeCrossings(graph: TalaGraph): number {
  let crossings = 0;
  for (let i = 0; i < graph.edges.length; i++) {
    const first = graph.edges[i]!;
    if (!first.from.topLeft || !first.to.topLeft) continue;
    for (let j = i + 1; j < graph.edges.length; j++) {
      const second = graph.edges[j]!;
      if (!second.from.topLeft || !second.to.topLeft) continue;
      if (first.from === second.from || first.from === second.to
        || first.to === second.from || first.to === second.to) continue;
      if (segmentCrosses(center(first.from), center(first.to), center(second.from), center(second.to))) crossings++;
    }
  }
  return crossings;
}

function center(node: { topLeft: Point | undefined; width: number; height: number }): Point {
  return { x: node.topLeft!.x + node.width / 2, y: node.topLeft!.y + node.height / 2 };
}

function segmentCrosses(u0: Point, u1: Point, v0: Point, v1: Point): boolean {
  const denominator = (u1.y - u0.y) * (v1.x - v0.x) - (u1.x - u0.x) * (v1.y - v0.y);
  if (denominator === 0) return false;
  const s = ((v1.x - v0.x) * (v0.y - u0.y) - (v1.y - v0.y) * (v0.x - u0.x)) / denominator;
  if (s < 0 || s > 1) return false;
  const t = ((u1.x - u0.x) * (v0.y - u0.y) - (u1.y - u0.y) * (v0.x - u0.x)) / denominator;
  return t >= 0 && t <= 1;
}

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
