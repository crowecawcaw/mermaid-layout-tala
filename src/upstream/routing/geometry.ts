// Translated from internal/routing/geometry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import type { Box } from '../geo/box.js';

export function segmentIntersectsBox(
  first: Point | null,
  second: Point | null,
  box: Box | null,
): boolean {
  if (!first || !second || !box || !box.TopLeft) return false;
  const left = Math.min(box.TopLeft.X, box.TopLeft.X + box.Width),
    right = Math.max(box.TopLeft.X, box.TopLeft.X + box.Width),
    top = Math.min(box.TopLeft.Y, box.TopLeft.Y + box.Height),
    bottom = Math.max(box.TopLeft.Y, box.TopLeft.Y + box.Height);
  if (
    Math.max(first.X, second.X) < left ||
    right < Math.min(first.X, second.X) ||
    Math.max(first.Y, second.Y) < top ||
    bottom < Math.min(first.Y, second.Y)
  )
    return false;
  const contains = (p: Point) =>
    left <= p.X && p.X <= right && top <= p.Y && p.Y <= bottom;
  if (contains(first) || contains(second)) return true;
  let enter = 0,
    exit = 1;
  const clip = (
    start: number,
    delta: number,
    min: number,
    max: number,
  ): boolean => {
    if (delta === 0) return min <= start && start <= max;
    let one = (min - start) / delta,
      two = (max - start) / delta;
    if (one > two) [one, two] = [two, one];
    enter = Math.max(enter, one);
    exit = Math.min(exit, two);
    return enter <= exit;
  };
  if (
    !clip(first.X, second.X - first.X, left, right) ||
    !clip(first.Y, second.Y - first.Y, top, bottom)
  )
    return false;
  return enter < exit;
}
export function orientation(first: Point, second: Point, third: Point): number {
  const x = second.X - first.X,
    y = second.Y - first.Y,
    tx = third.X - first.X,
    ty = third.Y - first.Y;
  return y * tx - x * ty;
}
export function closedIntervalsOverlap(
  a: number,
  b: number,
  c: number,
  d: number,
): boolean {
  return Math.min(a, b) <= Math.max(c, d) && Math.min(c, d) <= Math.max(a, b);
}
export function straddlesLine(a: number, b: number): boolean {
  return a === 0 || b === 0 || a < 0 !== b < 0;
}
export function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const cs = orientation(a, b, c),
    ds = orientation(a, b, d),
    as = orientation(c, d, a),
    bs = orientation(c, d, b);
  if (cs === 0 && ds === 0 && as === 0 && bs === 0)
    return (
      closedIntervalsOverlap(a.X, b.X, c.X, d.X) &&
      closedIntervalsOverlap(a.Y, b.Y, c.Y, d.Y)
    );
  return straddlesLine(cs, ds) && straddlesLine(as, bs);
}
