import type { Point } from '../layout.js';

const PRECISION = 0.0001;

/** Translation of lib/geo/bezier.go ComputeIntersections. */
export function bezierLineIntersections(points: readonly [Point, Point, Point, Point],
  from: Point, to: Point): Point[] {
  const px = points.map((point) => point.x);
  const py = points.map((point) => point.y);
  const a = to.y - from.y;
  const b = from.x - to.x;
  const c = from.x * (from.y - to.y) + from.y * (to.x - from.x);
  const bx = bezierCoeffs(px[0]!, px[1]!, px[2]!, px[3]!);
  const by = bezierCoeffs(py[0]!, py[1]!, py[2]!, py[3]!);
  const polynomial = [a * bx[0]! + b * by[0]!,
    a * bx[1]! + b * by[1]!, a * bx[2]! + b * by[2]!,
    a * bx[3]! + b * by[3]! + c];
  const result: Point[] = [];
  for (const t of cubicRoots(polynomial)) {
    const point = {
      x: bx[0]! * t * t * t + bx[1]! * t * t + bx[2]! * t + bx[3]!,
      y: by[0]! * t * t * t + by[1]! * t * t + by[2]! * t + by[3]!,
    };
    const s = from.x !== to.x ? (point.x - from.x) / (to.x - from.x)
      : (point.y - from.y) / (to.y - from.y);
    if (compare(t, 0) >= 0 && compare(t, 1) <= 0
      && compare(s, 0) >= 0 && compare(s, 1) <= 0) result.push(point);
  }
  return result;
}

function bezierCoeffs(p0: number, p1: number, p2: number, p3: number): number[] {
  return [-p0 + 3 * p1 - 3 * p2 + p3, 3 * p0 - 6 * p1 + 3 * p2,
    -3 * p0 + 3 * p1, p0];
}
function compare(a: number, b: number): number {
  if (Math.abs(a - b) < PRECISION) return 0;
  return a < b ? -1 : 1;
}
function sortSpecial(values: number[]): number[] {
  let flipped: boolean;
  do {
    flipped = false;
    for (let i = 0; i < values.length - 1; i++) {
      const first = values[i]!, second = values[i + 1]!;
      if (compare(second, 0) >= 0 && compare(first, second) > 0
        || compare(first, 0) < 0 && compare(second, 0) >= 0) {
        values[i] = second;
        values[i + 1] = first;
        flipped = true;
      }
    }
  } while (flipped);
  return values;
}
function sign(value: number): number { return value < 0 ? -1 : 1; }

function cubicRoots(p: number[]): number[] {
  if (compare(p[0]!, 0) === 0) {
    if (compare(p[1]!, 0) === 0) {
      const roots = [-p[3]! / p[2]!, -1, -1];
      if (compare(roots[0]!, 0) < 0 || compare(roots[0]!, 1) > 0) roots[0] = -1;
      return sortSpecial(roots);
    }
    let discriminant = Math.pow(p[2]!, 2) - 4 * p[1]! * p[3]!;
    if (compare(discriminant, 0) >= 0) {
      discriminant = Math.sqrt(discriminant);
      const roots = [-(discriminant + p[2]!) / (2 * p[1]!),
        (discriminant - p[2]!) / (2 * p[1]!), -1];
      // Preserve upstream's early return inside the first iteration.
      if (compare(roots[0]!, 0) < 0 || compare(roots[0]!, 1) > 0) roots[0] = -1;
      return sortSpecial(roots);
    }
  }
  const a = p[0]!, b = p[1]!, c = p[2]!, d = p[3]!;
  const A = b / a, B = c / a, C = d / a;
  const Q = (3 * B - Math.pow(A, 2)) / 9;
  const R = (9 * A * B - 27 * C - 2 * Math.pow(A, 3)) / 54;
  const D = Math.pow(Q, 3) + Math.pow(R, 2);
  const roots = [0, 0, 0];
  if (compare(D, 0) >= 0) {
    const s = sign(R + Math.sqrt(D)) * Math.pow(Math.abs(R + Math.sqrt(D)), 1 / 3);
    const t = sign(R - Math.sqrt(D)) * Math.pow(Math.abs(R - Math.sqrt(D)), 1 / 3);
    roots[0] = -A / 3 + s + t;
    roots[1] = -A / 3 - (s + t) / 2;
    roots[2] = roots[1]!;
    const imaginary = Math.abs(Math.sqrt(3) * (s - t) / 2);
    if (compare(imaginary, 0) !== 0) { roots[1] = -1; roots[2] = -1; }
  } else {
    const theta = Math.acos(R / Math.sqrt(-Math.pow(Q, 3)));
    roots[0] = 2 * Math.sqrt(-Q) * Math.cos(theta / 3) - A / 3;
    roots[1] = 2 * Math.sqrt(-Q) * Math.cos((theta + 2 * Math.PI) / 3) - A / 3;
    roots[2] = 2 * Math.sqrt(-Q) * Math.cos((theta + 4 * Math.PI) / 3) - A / 3;
  }
  for (let i = 0; i < 3; i++) {
    if (compare(roots[i]!, 0) < 0 || compare(roots[i]!, 1) > 0) roots[i] = -1;
  }
  return sortSpecial(roots);
}
