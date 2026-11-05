// Translated from internal/routing/shortcut_routes.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import type { RouteWorkGuard } from './stage-guard.js';
import { sameRouteDirection } from './edge-simplify.js';
export const shortcutEpsilon = 1e-6;
export function shortcutOrthogonal(points: Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.X) || !Number.isFinite(p.Y)) return false;
    if (
      i > 0 &&
      (p.Equals(points[i - 1]!) ||
        (p.X !== points[i - 1]!.X && p.Y !== points[i - 1]!.Y))
    )
      return false;
    if (
      i > 1 &&
      !sameRouteDirection(points[i - 2]!, points[i - 1]!, points[i - 1]!, p) &&
      (points[i - 2]!.X === p.X || points[i - 2]!.Y === p.Y)
    )
      return false;
  }
  return points.length >= 2;
}
export function shortcutLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length +=
      Math.abs(points[i]!.X - points[i - 1]!.X) +
      Math.abs(points[i]!.Y - points[i - 1]!.Y);
  return length;
}
export function shortcutBends(points: Point[]): number {
  let bends = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!,
      b = points[i - 1]!,
      c = points[i]!;
    if ((b.X - a.X) * (c.Y - b.Y) !== (b.Y - a.Y) * (c.X - b.X)) bends++;
  }
  return bends;
}
export function shortcutCandidate(
  points: Point[],
  start: number,
  end: number,
  horizontal: boolean,
): Point[] {
  const elbow = horizontal
    ? new Point(points[end]!.X, points[start]!.Y)
    : new Point(points[start]!.X, points[end]!.Y);
  const raw = [...points.slice(0, start + 1), elbow, ...points.slice(end)],
    result: Point[] = [];
  for (const p of raw) {
    if (result.length > 0 && result.at(-1)!.Equals(p)) continue;
    while (
      result.length >= 2 &&
      sameRouteDirection(result.at(-2)!, result.at(-1)!, result.at(-1)!, p)
    )
      result.pop();
    result.push(p);
  }
  return result;
}
export function shortcutPointOnSegment(p: Point, a: Point, b: Point): boolean {
  return (
    ((a.X === b.X && p.X === a.X) || (a.Y === b.Y && p.Y === a.Y)) &&
    p.X >= Math.min(a.X, b.X) - shortcutEpsilon &&
    p.X <= Math.max(a.X, b.X) + shortcutEpsilon &&
    p.Y >= Math.min(a.Y, b.Y) - shortcutEpsilon &&
    p.Y <= Math.max(a.Y, b.Y) + shortcutEpsilon
  );
}
export function shortcutSegmentsMeet(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  return (
    Math.max(Math.min(a.X, b.X), Math.min(c.X, d.X)) <=
      Math.min(Math.max(a.X, b.X), Math.max(c.X, d.X)) &&
    Math.max(Math.min(a.Y, b.Y), Math.min(c.Y, d.Y)) <=
      Math.min(Math.max(a.Y, b.Y), Math.max(c.Y, d.Y))
  );
}
export function shortcutThroughRays(
  points: Point[],
  p: Point,
  guard: RouteWorkGuard,
): [boolean, boolean] {
  let left = false,
    right = false,
    above = false,
    below = false;
  for (let i = 1; i < points.length; i++) {
    guard.Step();
    const a = points[i - 1]!,
      b = points[i]!;
    if (!shortcutPointOnSegment(p, a, b)) continue;
    if (a.Y === b.Y) {
      left ||= Math.min(a.X, b.X) < p.X;
      right ||= Math.max(a.X, b.X) > p.X;
    } else {
      above ||= Math.min(a.Y, b.Y) < p.Y;
      below ||= Math.max(a.Y, b.Y) > p.Y;
    }
  }
  return [left && right, above && below];
}
export function shortcutContactsPreserved(
  before: Point[],
  after: Point[],
  other: Point[],
  guard: RouteWorkGuard,
): boolean {
  const coordinate = (p: Point, horizontal: boolean) =>
    horizontal ? p.X : p.Y;
  for (let i = 1; i < after.length; i++)
    for (let j = 1; j < other.length; j++) {
      guard.Step();
      const a = after[i - 1]!,
        b = after[i]!,
        c = other[j - 1]!,
        d = other[j]!;
      if (!shortcutSegmentsMeet(a, b, c, d)) continue;
      if ((a.X === b.X) !== (c.X === d.X)) {
        const p = a.Y === b.Y ? new Point(c.X, a.Y) : new Point(a.X, c.Y);
        let covered = false;
        for (let k = 1; k < before.length; k++) {
          guard.Step();
          covered ||= shortcutPointOnSegment(p, before[k - 1]!, before[k]!);
        }
        const [oldH, oldV] = shortcutThroughRays(before, p, guard),
          [newH, newV] = shortcutThroughRays(after, p, guard),
          [otherH, otherV] = shortcutThroughRays(other, p, guard);
        if (
          !covered ||
          (((newH && otherV) || (newV && otherH)) &&
            !((oldH && otherV) || (oldV && otherH)))
        )
          return false;
        continue;
      }
      const horizontal = a.Y === b.Y,
        position = horizontal ? a.Y : a.X;
      const lo = Math.max(
        Math.min(coordinate(a, horizontal), coordinate(b, horizontal)),
        Math.min(coordinate(c, horizontal), coordinate(d, horizontal)),
      );
      const hi = Math.min(
        Math.max(coordinate(a, horizontal), coordinate(b, horizontal)),
        Math.max(coordinate(c, horizontal), coordinate(d, horizontal)),
      );
      let cursor = lo;
      for (;;) {
        let next = cursor,
          contains = false;
        for (let k = 1; k < before.length; k++) {
          guard.Step();
          const u = before[k - 1]!,
            v = before[k]!;
          if (
            (horizontal && (u.Y !== position || v.Y !== position)) ||
            (!horizontal && (u.X !== position || v.X !== position))
          )
            continue;
          const left = Math.min(
              coordinate(u, horizontal),
              coordinate(v, horizontal),
            ),
            right = Math.max(
              coordinate(u, horizontal),
              coordinate(v, horizontal),
            );
          if (
            left <= cursor + shortcutEpsilon &&
            right >= cursor - shortcutEpsilon
          ) {
            contains = true;
            next = Math.max(next, right);
          }
        }
        if (contains && next >= hi - shortcutEpsilon) break;
        if (next <= cursor + shortcutEpsilon) return false;
        cursor = next;
      }
    }
  return true;
}
