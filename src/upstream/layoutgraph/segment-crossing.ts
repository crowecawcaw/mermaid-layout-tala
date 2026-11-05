// Translated internal/layoutgraph/segment_crossing.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Point } from '../geo/point.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from '../placementcost/geometry.js';
export interface CrossingSegment {
  Start: Point;
  End: Point;
}
export function SegmentsCross(
  u0: Point,
  u1: Point,
  v0: Point,
  v1: Point,
): boolean {
  const denom = (u1.Y - u0.Y) * (v1.X - v0.X) - (u1.X - u0.X) * (v1.Y - v0.Y);
  if (denom === 0) return false;
  const s =
    ((v1.X - v0.X) * (v0.Y - u0.Y) - (v1.Y - v0.Y) * (v0.X - u0.X)) / denom;
  if (s < 0 || s > 1) return false;
  const t =
    ((u1.X - u0.X) * (v0.Y - u0.Y) - (u1.Y - u0.Y) * (v0.X - u0.X)) / denom;
  return t >= 0 && t <= 1;
}
function count(segments: CrossingSegment[], ctx: Context | null): number {
  let crossings = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    if (ctx !== null) scoringCancellationError(ctx, i);
    const start = segments[i]!.Start,
      end = segments[i]!.End;
    let minX = start.X,
      maxX = end.X,
      minY = start.Y,
      maxY = end.Y;
    if (maxX < minX) [minX, maxX] = [maxX, minX];
    if (maxY < minY) [minY, maxY] = [maxY, minY];
    for (let j = i + 1; j < segments.length; j++) {
      if (ctx !== null) scoringCancellationError(ctx, j - i - 1);
      const js = segments[j]!.Start,
        je = segments[j]!.End;
      if (js.X < je.X) {
        if (je.X < minX || maxX < js.X) continue;
      } else {
        if (js.X < minX || maxX < je.X) continue;
      }
      if (js.Y < je.Y) {
        if (je.Y < minY || maxY < js.Y) continue;
      } else {
        if (js.Y < minY || maxY < je.Y) continue;
      }
      if (start.Equals(js) || end.Equals(je)) continue;
      if (SegmentsCross(start, end, js, je)) crossings++;
    }
  }
  return crossings;
}
export function CountSegmentCrossings(segments: CrossingSegment[]): number {
  return count(segments, null);
}
export function CountSegmentCrossingsContext(
  ctx: Context,
  segments: CrossingSegment[],
): number {
  checkScoringCancellation(ctx);
  const crossings = count(segments, ctx);
  checkScoringCancellation(ctx);
  return crossings;
}
