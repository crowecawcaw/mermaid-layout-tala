// Translated internal/placementcost/symmetry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import { scoringCancellationError, symmetryToleranceBand } from './geometry.js';
import { scoringNodeBounds } from './obstruction-bounds.js';

export function obstructed(
  ctx: Context,
  center: Node,
  a: Node,
  b: Node,
  sib1: (Node | null)[],
  sib2: (Node | null)[],
): boolean {
  const bounds = scoringNodeBounds(center)
    .including(scoringNodeBounds(a))
    .including(scoringNodeBounds(b));
  for (const siblings of [sib1, sib2]) {
    for (let i = 0; i < siblings.length; i++) {
      scoringCancellationError(ctx, i);
      const s = siblings[i];
      if (
        s == null ||
        s.TopLeft === null ||
        s.Graph !== center.Graph ||
        s === center ||
        s === a ||
        s === b ||
        bounds.excludes(s)
      )
        continue;
      if (
        isDescendantOf(center, s) ||
        isDescendantOf(a, s) ||
        isDescendantOf(b, s)
      )
        continue;
      if (
        isDescendantOf(s, center) ||
        isDescendantOf(s, a) ||
        isDescendantOf(s, b)
      )
        continue;
      if (
        passesThrough(s, center.Center(), a.Center()) ||
        passesThrough(s, center.Center(), b.Center())
      )
        return true;
    }
  }
  return false;
}
export function isMirrored(
  a: Node,
  b: Node,
  isXAxis: boolean,
  axis: number,
): boolean {
  const ax = a.TopLeft!.X,
    ay = a.TopLeft!.Y,
    ar = ax + a.Width,
    ab = ay + a.Height;
  const bx = b.TopLeft!.X,
    by = b.TopLeft!.Y,
    br = bx + b.Width,
    bb = by + b.Height;
  const tolerance = symmetryToleranceBand * a.Graph!.CellSize;
  if (isXAxis) {
    if (ax === bx) return false;
    if (ax > bx) {
      if (!(axis > br && axis < ax)) return false;
      if (Math.abs(ax - axis - (axis - br)) > tolerance) return false;
    } else if (ax < bx) {
      if (!(axis > ar && axis < bx)) return false;
      if (Math.abs(bx - axis - (axis - ar)) > tolerance) return false;
    }
    return Math.abs((ay + ab) / 2 - (by + bb) / 2) <= tolerance;
  }
  if (ay === by) return false;
  if (ay > by) {
    if (!(axis > bb && axis < ay)) return false;
    if (Math.abs(ay - axis - (axis - bb)) > tolerance) return false;
  } else if (ay < by) {
    if (!(axis > ab && axis < by)) return false;
    if (Math.abs(by - axis - (axis - ab)) > tolerance) return false;
  }
  return Math.abs((ax + ar) / 2 - (bx + br) / 2) <= tolerance;
}
