// Translated from D2 lib/geo/segment.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point, IntersectionPoint } from './point.js';
import { EuclideanDistance } from './math.js';
import { Vector } from './vector.js';
export interface Intersectable {
  Intersections(segment: Segment): Point[];
}
export class Segment {
  constructor(
    public Start: Point,
    public End: Point,
  ) {}
  Overlaps(other: Segment, isHorizontal: boolean, buffer: number): boolean {
    if (isHorizontal) {
      if (
        Math.min(this.Start.Y, this.End.Y) -
          Math.max(other.Start.Y, other.End.Y) >=
        buffer
      )
        return false;
      if (
        Math.min(other.Start.Y, other.End.Y) -
          Math.max(this.Start.Y, this.End.Y) >=
        buffer
      )
        return false;
    } else {
      if (
        Math.min(this.Start.X, this.End.X) -
          Math.max(other.Start.X, other.End.X) >=
        buffer
      )
        return false;
      if (
        Math.min(other.Start.X, other.End.X) -
          Math.max(this.Start.X, this.End.X) >=
        buffer
      )
        return false;
    }
    return true;
  }
  Intersects(other: Segment): boolean {
    return (
      IntersectionPoint(this.Start, this.End, other.Start, other.End) !== null
    );
  }
  Intersections(other: Segment): Point[] {
    const p = IntersectionPoint(this.Start, this.End, other.Start, other.End);
    return p ? [p] : [];
  }
  ToString(): string {
    return `${this.Start.ToString()} -> ${this.End.ToString()}`;
  }
  GetBounds(segments: readonly Segment[], buffer: number): [number, number] {
    let ceil = Infinity,
      floor = -Infinity;
    if (this.Start.Equals(this.End)) return [floor, ceil];
    const isHorizontal = this.Start.X === this.End.X;
    for (const other of segments) {
      if (isHorizontal) {
        if (
          other.End.Y < this.Start.Y - buffer ||
          other.Start.Y > this.End.Y + buffer
        )
          continue;
        if (other.Start.X <= this.Start.X)
          floor = Math.max(floor, other.Start.X);
        if (other.Start.X > this.Start.X) ceil = Math.min(ceil, other.Start.X);
      } else {
        if (
          other.End.X < this.Start.X - buffer ||
          other.Start.X > this.End.X + buffer
        )
          continue;
        if (other.Start.Y <= this.Start.Y)
          floor = Math.max(floor, other.Start.Y);
        if (other.Start.Y > this.Start.Y) ceil = Math.min(ceil, other.Start.Y);
      }
    }
    return [floor, ceil];
  }
  Length(): number {
    return EuclideanDistance(
      this.Start.X,
      this.Start.Y,
      this.End.X,
      this.End.Y,
    );
  }
  ToVector(): Vector {
    return new Vector(this.End.X - this.Start.X, this.End.Y - this.Start.Y);
  }
}
