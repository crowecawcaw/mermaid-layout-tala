// Translated from internal/packing/routed_container.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Box } from '../geo/box.js';
import type { Point } from '../geo/point.js';
import type { WorkGuard } from '../limits/work.js';
export const routedContainerTop = 1,
  routedContainerLeft = 2,
  routedContainerBottom = 4,
  routedContainerRight = 8;
export function routedContainerPointIsFinite(p: Point | null): boolean {
  return !!p && Number.isFinite(p.X) && Number.isFinite(p.Y);
}
export function routedContainerBoxIsFinite(b: Box | null): boolean {
  return (
    !!b &&
    !!b.TopLeft &&
    b.Width > 0 &&
    b.Height > 0 &&
    Number.isFinite(b.TopLeft.X) &&
    Number.isFinite(b.TopLeft.Y) &&
    Number.isFinite(b.Width) &&
    Number.isFinite(b.Height) &&
    Number.isFinite(b.TopLeft.X + b.Width) &&
    Number.isFinite(b.TopLeft.Y + b.Height)
  );
}
export function routedContainerBoxCovers(outer: Box, inner: Box): boolean {
  return (
    inner.TopLeft.X >= outer.TopLeft.X &&
    inner.TopLeft.Y >= outer.TopLeft.Y &&
    inner.TopLeft.X + inner.Width <= outer.TopLeft.X + outer.Width &&
    inner.TopLeft.Y + inner.Height <= outer.TopLeft.Y + outer.Height
  );
}
export function routedContainerPointSides(box: Box, point: Point): number {
  if (!routedContainerBoxIsFinite(box) || !routedContainerPointIsFinite(point))
    return 0;
  const left = box.TopLeft.X,
    top = box.TopLeft.Y,
    right = left + box.Width,
    bottom = top + box.Height;
  let sides = 0;
  if (point.Y === top && point.X >= left && point.X <= right)
    sides |= routedContainerTop;
  if (point.X === left && point.Y >= top && point.Y <= bottom)
    sides |= routedContainerLeft;
  if (point.Y === bottom && point.X >= left && point.X <= right)
    sides |= routedContainerBottom;
  if (point.X === right && point.Y >= top && point.Y <= bottom)
    sides |= routedContainerRight;
  return sides;
}
export function routedContainerEndpointKeepsSides(
  original: Box,
  proposed: Box,
  point: Point,
): boolean {
  const sides = routedContainerPointSides(original, point);
  if (!sides) return false;
  const l = original.TopLeft.X,
    t = original.TopLeft.Y,
    r = l + original.Width,
    b = t + original.Height,
    pl = proposed.TopLeft.X,
    pt = proposed.TopLeft.Y,
    pr = pl + proposed.Width,
    pb = pt + proposed.Height;
  if ((sides & routedContainerTop) !== 0 && (pt !== t || pl !== l || pr !== r))
    return false;
  if ((sides & routedContainerLeft) !== 0 && (pl !== l || pt !== t || pb !== b))
    return false;
  if (
    (sides & routedContainerBottom) !== 0 &&
    (pb !== b || pl !== l || pr !== r)
  )
    return false;
  if (
    (sides & routedContainerRight) !== 0 &&
    (pr !== r || pt !== t || pb !== b)
  )
    return false;
  return true;
}
export function routedContainerControlHullIsPreserved(
  original: Box,
  proposed: Box,
  ...points: Point[]
): boolean {
  let inside = true,
    left = true,
    top = true,
    right = true,
    bottom = true;
  const l = original.TopLeft.X,
    t = original.TopLeft.Y,
    r = l + original.Width,
    b = t + original.Height;
  for (const p of points) {
    if (!routedContainerPointIsFinite(p)) return false;
    inside = inside && proposed.Contains(p);
    left = left && p.X < l;
    top = top && p.Y < t;
    right = right && p.X > r;
    bottom = bottom && p.Y > b;
  }
  return inside || left || top || right || bottom;
}
export function routedContainerSegmentBoxInterval(
  box: Box,
  start: Point,
  end: Point,
  guard: WorkGuard,
): [number, number, boolean, boolean] {
  const dx = end.X - start.X,
    dy = end.Y - start.Y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [0, 0, false, false];
  const left = box.TopLeft.X,
    top = box.TopLeft.Y,
    right = left + box.Width,
    bottom = top + box.Height;
  const constraints = [
    [-dx, start.X - left],
    [dx, right - start.X],
    [-dy, start.Y - top],
    [dy, bottom - start.Y],
  ];
  let enter = 0,
    exit = 1;
  for (const [p, q] of constraints as [number, number][]) {
    guard.Step();
    if (p === 0) {
      if (q < 0) return [0, 0, false, true];
      continue;
    }
    const ratio = q / p;
    if (!Number.isFinite(ratio)) return [0, 0, false, false];
    if (p < 0) {
      if (ratio > exit) return [0, 0, false, true];
      if (ratio > enter) enter = ratio;
    } else {
      if (ratio < enter) return [0, 0, false, true];
      if (ratio < exit) exit = ratio;
    }
  }
  return [enter, exit, true, true];
}
export function routedContainerSegmentStaysInsideShrink(
  original: Box,
  proposed: Box,
  start: Point,
  end: Point,
  guard: WorkGuard,
): boolean {
  if (
    !routedContainerBoxIsFinite(original) ||
    !routedContainerBoxIsFinite(proposed) ||
    !routedContainerPointIsFinite(start) ||
    !routedContainerPointIsFinite(end)
  )
    return false;
  if (start.X === end.X && start.Y === end.Y) return false;
  const [enter, exit, intersects, valid] = routedContainerSegmentBoxInterval(
    original,
    start,
    end,
    guard,
  );
  if (!valid) return false;
  if (!intersects) return true;
  const [pEnter, pExit, pIntersects, pValid] =
    routedContainerSegmentBoxInterval(proposed, start, end, guard);
  return pValid && pIntersects && pEnter <= enter && pExit >= exit;
}
