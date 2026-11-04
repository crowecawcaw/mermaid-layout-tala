// Translated node/edge port geometry from internal/layoutgraph at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import { Point } from '../geo/point.js';
import { Round, PrecisionCompare } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import { TableColumnPortValue } from '../nodeshape/shape_table.js';
import { nodeOrientation } from './node-spatial.js';
import { AxisAlignmentTolerance } from './geometry-policy.js';
export function ports(n: Node): Point[] {
  const result: Point[] = [];
  for (const relative of n.Shape.SnapPointPercentages())
    for (const p of relative)
      result.push(
        new Point(
          n.TopLeft!.X + Round(n.Width * p.XPercentage),
          n.TopLeft!.Y + Round(n.Height * p.YPercentage),
        ),
      );
  return result;
}
export function nthPortValue(n: Node, index: number): [Point, boolean] {
  let i = 0;
  for (const relative of n.Shape.SnapPointPercentages())
    for (const p of relative) {
      if (i === index)
        return [
          new Point(
            n.TopLeft!.X + Round(n.Width * p.XPercentage),
            n.TopLeft!.Y + Round(n.Height * p.YPercentage),
          ),
          true,
        ];
      i++;
    }
  return [new Point(0, 0), false];
}
export function nthPort(n: Node, index: number): Point | null {
  const [p, ok] = nthPortValue(n, index);
  return ok ? p : null;
}
export function pointToPortOrientation(n: Node, p: Point): O {
  for (const o of [O.Top, O.Right, O.Left, O.Bottom])
    for (const i of n.Shape.PortIndices(o)) {
      const port = nthPort(n, i);
      if (port !== null && p.Equals(port)) return o;
    }
  return O.NONE;
}
export function nthPortOnSideValue(
  n: Node,
  o: O,
  index: number,
): [Point, boolean] {
  const indices = n.Shape.PortIndices(o);
  if (index < 0 || index >= indices.length)
    throw new RangeError('port index out of range');
  return nthPortValue(n, indices[index]!);
}
export function tableColumnPortValue(
  n: Node,
  o: O,
  column: number,
): [Point, boolean] {
  const [port, ok] = TableColumnPortValue(n.Shape, o, column);
  return ok ? [port, true] : nthPortOnSideValue(n, o, column);
}
export function centerPorts(n: Node): Point[] {
  const p = ports(n);
  return n.Shape.CenterPortIndices().map((i) => p[i]!);
}
export function portsByOrientation(n: Node, o: O): Point[] {
  const p = ports(n);
  return n.Shape.PortIndices(o).map((i) => p[i]!);
}
export const hasTableColumn = (e: Edge): boolean =>
  e.FromTableColumnIndex !== null || e.ToTableColumnIndex !== null;
export interface FacingTablePortValues {
  from: Point;
  to: Point;
  hasFrom: boolean;
  hasTo: boolean;
  orientation: O;
}
const noPorts = (): FacingTablePortValues => ({
  from: new Point(0, 0),
  to: new Point(0, 0),
  hasFrom: false,
  hasTo: false,
  orientation: O.NONE,
});
export function facingTablePorts(
  e: Edge,
  abductionFrom: Node | null,
  abductionTo: Node | null,
): FacingTablePortValues {
  if (!hasTableColumn(e)) return noPorts();
  const from = abductionFrom ?? e.From,
    to = abductionTo ?? e.To,
    orientation = nodeOrientation(from, to),
    result = { ...noPorts(), orientation };
  switch (orientation) {
    case O.TopLeft:
    case O.BottomLeft:
    case O.Left:
      if (e.FromTableColumnIndex !== null)
        [result.from, result.hasFrom] = tableColumnPortValue(
          from,
          O.Right,
          e.FromTableColumnIndex,
        );
      if (e.ToTableColumnIndex !== null)
        [result.to, result.hasTo] = tableColumnPortValue(
          to,
          O.Left,
          e.ToTableColumnIndex,
        );
      return result;
    case O.Right:
    case O.TopRight:
    case O.BottomRight:
      if (e.FromTableColumnIndex !== null)
        [result.from, result.hasFrom] = tableColumnPortValue(
          from,
          O.Left,
          e.FromTableColumnIndex,
        );
      if (e.ToTableColumnIndex !== null)
        [result.to, result.hasTo] = tableColumnPortValue(
          to,
          O.Right,
          e.ToTableColumnIndex,
        );
      return result;
  }
  return noPorts();
}
export function isAxisAligned(e: Edge): boolean {
  if (e.From === null || e.To === null) return false;
  const equal = (a: number, b: number) =>
    PrecisionCompare(a, b, AxisAlignmentTolerance) === 0;
  if (hasTableColumn(e)) {
    const p = facingTablePorts(e, null, null);
    if (p.hasFrom && p.hasTo) {
      if (equal(p.from.Y, p.to.Y)) return true;
    } else if (p.hasFrom) {
      if (equal(p.from.Y, e.To.TopLeft!.Y + e.To.Height / 2)) return true;
    } else if (p.hasTo) {
      if (equal(p.to.Y, e.From.TopLeft!.Y + e.From.Height / 2)) return true;
    } else if (equal(e.From.TopLeft!.X, e.To.TopLeft!.X)) return true;
    else if (
      equal(e.From.TopLeft!.X + e.From.Width, e.To.TopLeft!.X + e.To.Width)
    )
      return true;
    return false;
  }
  if (
    equal(
      e.From.TopLeft!.Y + e.From.Height / 2,
      e.To.TopLeft!.Y + e.To.Height / 2,
    )
  )
    return true;
  if (
    equal(
      e.From.TopLeft!.X + e.From.Width / 2,
      e.To.TopLeft!.X + e.To.Width / 2,
    )
  )
    return true;
  return false;
}
