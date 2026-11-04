// Translated from D2 lib/geo/ellipse.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from './point.js';
import { Segment } from './segment.js';
import { PrecisionCompare } from './math.js';
import { PRECISION } from './bezier.js';
export class Ellipse {
  constructor(
    public Center: Point,
    public Rx: number,
    public Ry: number,
  ) {}
  Intersections(segment: Segment): Point[] {
    const intersections: Point[] = [],
      a = this.Rx,
      b = this.Ry,
      a2 = a * a,
      b2 = b * b;
    if (a <= 0 || b <= 0) return [];
    const x1 = segment.Start.X - this.Center.X,
      y1 = segment.Start.Y - this.Center.Y,
      x2 = segment.End.X - this.Center.X,
      y2 = segment.End.Y - this.Center.Y;
    if (x1 === x2) {
      const p1 = new Point(x1, (b * Math.sqrt(a2 - x1 * x1)) / a),
        p2 = p1.Copy();
      p2.Y *= -1;
      const onLine = (p: Point) => {
        const ps = [p.Y, y1, y2];
        // Go sort.Slice's insertion order for three elements, including NaN comparisons.
        for (let i = 1; i < ps.length; i++)
          for (let j = i; j > 0 && ps[j]! < ps[j - 1]!; j--)
            [ps[j], ps[j - 1]] = [ps[j - 1]!, ps[j]!];
        return ps[1] === p.Y;
      };
      if (onLine(p1)) intersections.push(p1);
      if (p2.Y !== 0 && onLine(p2)) intersections.push(p2);
    } else {
      const m = (y2 - y1) / (x2 - x1),
        c = y1 - m * x1;
      const onLine = (p: Point) =>
        PrecisionCompare(
          p.DistanceToLine(new Point(x1, y1), new Point(x2, y2)),
          0,
          PRECISION,
        ) === 0;
      const denom = a2 * m * m + b2,
        root = Math.sqrt(a2 * b2 * (denom - c * c));
      const p1 = new Point(
          (-m * c * a2 + root) / denom,
          (c * b2 + m * root) / denom,
        ),
        p2 = new Point(
          (-m * c * a2 - root) / denom,
          (c * b2 - m * root) / denom,
        );
      if (onLine(p1)) intersections.push(p1);
      if (!p1.Equals(p2) && onLine(p2)) intersections.push(p2);
    }
    for (const p of intersections) {
      p.X += this.Center.X;
      p.Y += this.Center.Y;
    }
    return intersections;
  }
}
