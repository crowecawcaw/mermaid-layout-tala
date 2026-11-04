// Translated from D2 lib/geo/box.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point, IntersectionPoint } from './point.js';
import { Segment } from './segment.js';
export class Box {
  constructor(
    public TopLeft: Point,
    public Width: number,
    public Height: number,
  ) {}
  Copy(): Box {
    return new Box(this.TopLeft.Copy(), this.Width, this.Height);
  }
  Center(): Point {
    return new Point(
      this.TopLeft.X + this.Width / 2,
      this.TopLeft.Y + this.Height / 2,
    );
  }
  Intersects(s: Segment, buffer: number): boolean {
    const tl = new Point(this.TopLeft.X - buffer, this.TopLeft.Y - buffer);
    return (
      new Box(
        tl,
        this.Width + buffer * 2,
        this.Height + buffer * 2,
      ).Intersections(s).length > 0
    );
  }
  Intersections(s: Segment): Point[] {
    const tl = this.TopLeft,
      tr = new Point(tl.X + this.Width, tl.Y),
      br = new Point(tr.X, tr.Y + this.Height),
      bl = new Point(tl.X, br.Y);
    const points: Point[] = [];
    for (const [a, b] of [
      [tl, tr],
      [tr, br],
      [br, bl],
      [bl, tl],
    ] as [Point, Point][]) {
      const p = IntersectionPoint(s.Start, s.End, a, b);
      if (p) points.push(p);
    }
    return points;
  }
  Contains(p: Point): boolean {
    return !(
      p.X < this.TopLeft.X ||
      this.TopLeft.X + this.Width < p.X ||
      p.Y < this.TopLeft.Y ||
      this.TopLeft.Y + this.Height < p.Y
    );
  }
  Overlaps(b: Box): boolean {
    return (
      this.TopLeft.X < b.TopLeft.X + b.Width &&
      this.TopLeft.X + this.Width > b.TopLeft.X &&
      this.TopLeft.Y < b.TopLeft.Y + b.Height &&
      this.TopLeft.Y + this.Height > b.TopLeft.Y
    );
  }
}
