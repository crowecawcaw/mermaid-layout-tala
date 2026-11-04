// Translated from D2 lib/geo/point.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Round, Sign, TruncateDecimals } from './math.js';
import { Orientation } from './orientation.js';
import { Vector } from './vector.js';
export class RelativePoint {
  XPercentage: number;
  YPercentage: number;
  constructor(x: number, y: number) {
    this.XPercentage = TruncateDecimals(x);
    this.YPercentage = TruncateDecimals(y);
  }
}
export class Point {
  constructor(
    public X: number,
    public Y: number,
  ) {}
  Equals(other: Point | null): boolean {
    return other !== null && this.X === other.X && this.Y === other.Y;
  }
  Compare(other: Point): number {
    const x = Sign(this.X - other.X);
    return x === 0 ? Sign(this.Y - other.Y) : x;
  }
  Copy(): Point {
    return new Point(this.X, this.Y);
  }
  GetOrientation(to: Point): Orientation {
    const {
      TopLeft,
      TopRight,
      BottomLeft,
      BottomRight,
      Top,
      Right,
      Bottom,
      Left,
      NONE,
    } = Orientation;
    if (this.Y < to.Y)
      return this.X < to.X ? TopLeft : this.X > to.X ? TopRight : Top;
    if (this.Y > to.Y)
      return this.X < to.X ? BottomLeft : this.X > to.X ? BottomRight : Bottom;
    return this.X < to.X ? Left : this.X > to.X ? Right : NONE;
  }
  ToString(): string {
    return `(${this.X}, ${this.Y})`;
  }
  DistanceToLine(p1: Point, p2: Point): number {
    const a = this.X - p1.X,
      b = this.Y - p1.Y,
      c = p2.X - p1.X,
      d = p2.Y - p1.Y;
    const dot = a * c + b * d,
      lenSq = c * c + d * d;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    const xx = param < 0 ? p1.X : param > 1 ? p2.X : p1.X + param * c;
    const yy = param < 0 ? p1.Y : param > 1 ? p2.Y : p1.Y + param * d;
    const dx = this.X - xx,
      dy = this.Y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
  AddVector(v: Vector): Point {
    return this.ToVector().Add(v).ToPoint();
  }
  VectorTo(endpoint: Point): Vector {
    return endpoint.ToVector().Minus(this.ToVector());
  }
  FormattedCoordinates(): string {
    return `${Math.trunc(this.X)},${Math.trunc(this.Y)}`;
  }
  OnOrthogonalSegment(a: Point, b: Point): boolean {
    if (a.X < b.X) {
      if (this.X < a.X || b.X < this.X) return false;
    } else if (this.X < b.X || a.X < this.X) return false;
    if (a.Y < b.Y) {
      if (this.Y < a.Y || b.Y < this.Y) return false;
    } else if (this.Y < b.Y || a.Y < this.Y) return false;
    return true;
  }
  ToVector(): Vector {
    return new Vector(this.X, this.Y);
  }
  Transpose(): void {
    [this.X, this.Y] = [this.Y, this.X];
  }
  Interpolate(b: Point, t: number): Point {
    return new Point(this.X * (1 - t) + b.X * t, this.Y * (1 - t) + b.Y * t);
  }
  TruncateFloat32(): void {
    this.X = Math.fround(this.X);
    this.Y = Math.fround(this.Y);
  }
  TruncateDecimals(): void {
    this.X = TruncateDecimals(this.X);
    this.Y = TruncateDecimals(this.Y);
  }
  toJSON(): { x: number; y: number } {
    return { x: this.X, y: this.Y };
  }
}
export function PointsEqual(
  ps: readonly Point[] | null,
  other: readonly Point[] | null,
): boolean {
  if (ps === null) return other === null;
  if (other === null) return false;
  // Upstream intentionally checks membership, not length or multiplicity.
  return other.every((p) => ps.some((q) => p.Equals(q)));
}
export function GetMedian(ps: readonly Point[]): Point {
  const order = (a: number, b: number) =>
    Number.isNaN(a) ? (Number.isNaN(b) ? 0 : -1) : Number.isNaN(b) ? 1 : a - b;
  const xs = ps.map((p) => p.X).sort(order),
    ys = ps.map((p) => p.Y).sort(order),
    middle = Math.floor(xs.length / 2);
  if (!xs.length) throw new RangeError('median of empty points');
  let x = xs[middle]!,
    y = ys[middle]!;
  if (xs.length % 2 === 0) {
    x = (x + xs[middle - 1]!) / 2;
    y = (y + ys[middle - 1]!) / 2;
  }
  return new Point(x, y);
}
export function IntersectionPoint(
  u0: Point,
  u1: Point,
  v0: Point,
  v1: Point,
): Point | null {
  const udx = u1.X - u0.X,
    vdx = v1.X - v0.X,
    uvdx = v0.X - u0.X,
    udy = u1.Y - u0.Y,
    vdy = v1.Y - v0.Y,
    uvdy = v0.Y - u0.Y;
  const denom = udy * vdx - udx * vdy;
  if (denom === 0) return null;
  const s = (vdx * uvdy - vdy * uvdx) / denom,
    t = (udx * uvdy - udy * uvdx) / denom;
  if (s < 0 || s > 1 || t < 0 || t > 1) return null;
  return new Point(u0.X + Round(s * udx), u0.Y + Round(s * udy));
}
export function RemovePoints(
  points: readonly Point[],
  remove: readonly boolean[],
): Point[] {
  return points.filter((_, i) => !remove[i]);
}
