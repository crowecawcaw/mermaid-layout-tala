// Translated from D2 lib/geo/bezier.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
// Upstream derives cubic intersections from particleincell.com/2013/cubic-line-intersection/.
import { Point } from './point.js';
import { Segment } from './segment.js';
import { PrecisionCompare } from './math.js';
export const PRECISION = 0.0001;
type Four = [number, number, number, number];
export class BezierCurve {
  private readonly curve: { Point: Point; Control: Point }[];
  constructor(private readonly points: Point[]) {
    let w = 0;
    this.curve = points.map((p, i) => {
      if (i === 0) w = 1;
      else if (i === 1) w = points.length - 1;
      else w *= (points.length - i) / i;
      return { Point: p.Copy(), Control: new Point(p.X * w, p.Y * w) };
    });
  }
  At(t: number): Point {
    const c = this.curve;
    c[0]!.Point = c[0]!.Control.Copy();
    let u = t;
    for (let i = 1; i < c.length; i++) {
      const p = c[i]!;
      p.Point = new Point(p.Control.X * u, p.Control.Y * u);
      u *= t;
    }
    const t1 = 1 - t;
    let tt = t1;
    const p = c[c.length - 1]!.Point.Copy();
    for (let i = c.length - 2; i >= 0; i--) {
      p.X += c[i]!.Point.X * tt;
      p.Y += c[i]!.Point.Y * tt;
      tt *= t1;
    }
    return p;
  }
  Intersections(segment: Segment): Point[] {
    return ComputeIntersections(
      this.points.slice(0, 4).map((p) => p.X) as Four,
      this.points.slice(0, 4).map((p) => p.Y) as Four,
      [segment.Start.X, segment.End.X],
      [segment.Start.Y, segment.End.Y],
    );
  }
}
export function ComputeIntersections(
  px: Four,
  py: Four,
  lx: [number, number],
  ly: [number, number],
): Point[] {
  const out: Point[] = [],
    A = ly[1] - ly[0],
    B = lx[0] - lx[1],
    C = lx[0] * (ly[0] - ly[1]) + ly[0] * (lx[1] - lx[0]);
  const bx = bezierCoeffs(...px),
    by = bezierCoeffs(...py);
  const r = cubicRoots([
    A * bx[0] + B * by[0],
    A * bx[1] + B * by[1],
    A * bx[2] + B * by[2],
    A * bx[3] + B * by[3] + C,
  ]);
  for (let i = 0; i < 3; i++) {
    const t = r[i]!,
      point = new Point(
        bx[0] * t * t * t + bx[1] * t * t + bx[2] * t + bx[3],
        by[0] * t * t * t + by[1] * t * t + by[2] * t + by[3],
      );
    const s =
      lx[1] - lx[0] !== 0
        ? (point.X - lx[0]) / (lx[1] - lx[0])
        : (point.Y - ly[0]) / (ly[1] - ly[0]);
    if (!(
      PrecisionCompare(t, 0, PRECISION) < 0 ||
      PrecisionCompare(t, 1, PRECISION) > 0 ||
      PrecisionCompare(s, 0, PRECISION) < 0 ||
      PrecisionCompare(s, 1, PRECISION) > 0
    ))
      out.push(point);
  }
  return out;
}
export function cubicRoots(P: Four): number[] {
  if (PrecisionCompare(P[0], 0, PRECISION) === 0) {
    if (PrecisionCompare(P[1], 0, PRECISION) === 0) {
      const t = [-1 * (P[3] / P[2]), -1, -1];
      if (
        PrecisionCompare(t[0]!, 0, PRECISION) < 0 ||
        PrecisionCompare(t[0]!, 1, PRECISION) > 0
      )
        t[0] = -1;
      return sortSpecial(t);
    }
    let DQ = P[2] ** 2 - 4 * P[1] * P[3];
    if (PrecisionCompare(DQ, 0, PRECISION) >= 0) {
      DQ = Math.sqrt(DQ);
      const t = [-1 * ((DQ + P[2]) / (2 * P[1])), (DQ - P[2]) / (2 * P[1]), -1];
      // Preserve the upstream early return: only the first quadratic root is filtered here.
      if (
        PrecisionCompare(t[0]!, 0, PRECISION) < 0 ||
        PrecisionCompare(t[0]!, 1, PRECISION) > 0
      )
        t[0] = -1;
      return sortSpecial(t);
    }
  }
  const [a, b, c, d] = P,
    A = b / a,
    B = c / a,
    C = d / a,
    Q = (3 * B - A ** 2) / 9,
    R = (9 * A * B - 27 * C - 2 * A ** 3) / 54,
    D = Q ** 3 + R ** 2;
  const t = [0, 0, 0];
  if (PrecisionCompare(D, 0, PRECISION) >= 0) {
    const S =
        sgn(R + Math.sqrt(D)) * Math.pow(Math.abs(R + Math.sqrt(D)), 1 / 3),
      T = sgn(R - Math.sqrt(D)) * Math.pow(Math.abs(R - Math.sqrt(D)), 1 / 3);
    t[0] = -A / 3 + (S + T);
    t[1] = -A / 3 - (S + T) / 2;
    t[2] = -A / 3 - (S + T) / 2;
    const Im = Math.abs((Math.sqrt(3) * (S - T)) / 2);
    if (PrecisionCompare(Im, 0, PRECISION) !== 0) {
      t[1] = -1;
      t[2] = -1;
    }
  } else {
    const th = Math.acos(R / Math.sqrt(-(Q ** 3)));
    t[0] = 2 * Math.sqrt(-Q) * Math.cos(th / 3) - A / 3;
    t[1] = 2 * Math.sqrt(-Q) * Math.cos((th + 2 * Math.PI) / 3) - A / 3;
    t[2] = 2 * Math.sqrt(-Q) * Math.cos((th + 4 * Math.PI) / 3) - A / 3;
  }
  for (let i = 0; i < 3; i++)
    if (
      PrecisionCompare(t[i]!, 0, PRECISION) < 0 ||
      PrecisionCompare(t[i]!, 1, PRECISION) > 0
    )
      t[i] = -1;
  return sortSpecial(t);
}
function sortSpecial(a: number[]): number[] {
  for (;;) {
    let flip = false;
    for (let i = 0; i < a.length - 1; i++) {
      const nextPositive = PrecisionCompare(a[i + 1]!, 0, PRECISION) >= 0;
      if (
        (nextPositive && PrecisionCompare(a[i]!, a[i + 1]!, PRECISION) > 0) ||
        (PrecisionCompare(a[i]!, 0, PRECISION) < 0 && nextPositive)
      ) {
        flip = true;
        [a[i], a[i + 1]] = [a[i + 1]!, a[i]!];
      }
    }
    if (!flip) break;
  }
  return a;
}
function sgn(x: number): number {
  return x < 0 ? -1 : 1;
}
function bezierCoeffs(P0: number, P1: number, P2: number, P3: number): Four {
  return [
    -P0 + 3 * P1 + -3 * P2 + P3,
    3 * P0 - 6 * P1 + 3 * P2,
    -3 * P0 + 3 * P1,
    P0,
  ];
}
