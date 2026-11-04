// Translated from D2 lib/geo/route.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from './point.js';
import { EuclideanDistance } from './math.js';
export class Route {
  constructor(public points: Point[]) {}
  Length(): number {
    let length = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]!,
        b = this.points[i + 1]!;
      length += EuclideanDistance(a.X, a.Y, b.X, b.Y);
    }
    return length;
  }
  GetPointAtDistance(distance: number): [Point, number] {
    let remaining = distance,
      curr: Point | undefined,
      next: Point | undefined,
      length = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      curr = this.points[i]!;
      next = this.points[i + 1]!;
      length = EuclideanDistance(curr.X, curr.Y, next.X, next.Y);
      if (remaining <= length)
        return [curr.Interpolate(next, remaining / length), i];
      remaining -= length;
    }
    if (!curr || !next) throw new RangeError('route requires a segment');
    return [
      curr.Interpolate(next, 1 + remaining / length),
      this.points.length - 2,
    ];
  }
  GetBoundingBox(): [Point, Point] {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of this.points) {
      if (p.X < minX) minX = p.X;
      if (p.X > maxX) maxX = p.X;
      if (p.Y < minY) minY = p.Y;
      if (p.Y > maxY) maxY = p.Y;
    }
    return [new Point(minX, minY), new Point(maxX, maxY)];
  }
}
