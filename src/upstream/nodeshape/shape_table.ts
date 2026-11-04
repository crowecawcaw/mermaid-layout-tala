// Translated from internal/nodeshape/shape_table.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapeSquare } from './shape_square.js';
import type { ShapePolicy } from './policy.js';
import { Point, RelativePoint } from '../geo/point.js';
import { Round, TruncateDecimals } from '../geo/math.js';
import { Orientation } from '../geo/orientation.js';
export class ShapeTable extends ShapeSquare {
  numColumns = 0;
  override SnapPointPercentages(): RelativePoint[][] {
    const left: RelativePoint[] = [],
      right: RelativePoint[] = [];
    if (this.numColumns === 0) {
      left.push(new RelativePoint(0, 0.5));
      right.push(new RelativePoint(1, 0.5));
    } else {
      if (this.numColumns + 1 < 0)
        throw new RangeError('negative table port capacity');
      const rowHeight = 1 / (this.numColumns + 1),
        midRow = rowHeight / 2;
      for (let perc = rowHeight + midRow; perc < 1; perc += rowHeight) {
        const h = Round(perc * 10000) / 10000;
        left.push(new RelativePoint(0, h));
        right.push(new RelativePoint(1, h));
      }
    }
    return [
      [
        new RelativePoint(0.25, 0),
        new RelativePoint(0.5, 0),
        new RelativePoint(0.75, 0),
      ],
      left,
      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],
      right,
    ];
  }
  override CenterPortIndices(): number[] {
    return this.numColumns > 0 ? [] : [1, 3, 5, 7];
  }
  override CenterPortIndex(o: Orientation): number {
    if (this.numColumns > 0) return -1;
    const ports = this.CenterPortIndices();
    switch (o) {
      case Orientation.Top:
        return ports[0]!;
      case Orientation.Left:
        return ports[1]!;
      case Orientation.Bottom:
        return ports[2]!;
      case Orientation.Right:
        return ports[3]!;
      default:
        return -1;
    }
  }
  override MirroredPortIndices(): Map<number, number> {
    if (this.numColumns > 0) return new Map();
    const p = this.CenterPortIndices();
    return new Map([
      [p[0]!, p[2]!],
      [p[2]!, p[0]!],
      [p[1]!, p[3]!],
      [p[3]!, p[1]!],
    ]);
  }
  override PortIndices(o: Orientation): number[] {
    const count = this.numColumns === 0 ? 1 : this.numColumns,
      top = [0, 1, 2],
      left = new Array<number>(count),
      bottom = new Array<number>(3),
      right = new Array<number>(count);
    const firstLeft = top[2]! + 1;
    for (let i = 0; i < count; i++) left[i] = firstLeft + i;
    const firstBottom = left[count - 1]! + 1;
    for (let i = 0; i < 3; i++) bottom[i] = firstBottom + i;
    const firstRight = bottom[2]! + 1;
    for (let i = 0; i < count; i++) right[i] = firstRight + i;
    switch (o) {
      case Orientation.Top:
        return top;
      case Orientation.Left:
        return left;
      case Orientation.Bottom:
        return bottom;
      case Orientation.Right:
        return right;
      case Orientation.TopLeft:
        return [...top, ...left];
      case Orientation.TopRight:
        return [...top, ...right];
      case Orientation.BottomLeft:
        return [...bottom, ...left];
      case Orientation.BottomRight:
        return [...bottom, ...right];
      default:
        return [];
    }
  }
}
export function NumColumns(s: ShapePolicy): number {
  return s instanceof ShapeTable ? s.numColumns : 0;
}
export function SetNumColumns(s: ShapePolicy, n: number): void {
  if (s instanceof ShapeTable) s.numColumns = n;
}
export function TablePortIndex(
  s: ShapePolicy,
  o: Orientation,
  column: number,
): [number, boolean] {
  if (!(s instanceof ShapeTable)) return [0, false];
  const count = s.numColumns === 0 ? 1 : s.numColumns;
  if (column < 0 || column >= count)
    throw new RangeError('table column port index out of range');
  switch (o) {
    case Orientation.Left:
      return [3 + column, true];
    case Orientation.Right:
      return [6 + count + column, true];
    default:
      return [0, false];
  }
}
export function TableColumnPortValue(
  s: ShapePolicy,
  o: Orientation,
  column: number,
): [Point, boolean] {
  if (
    !(s instanceof ShapeTable) ||
    (o !== Orientation.Left && o !== Orientation.Right)
  )
    return [new Point(0, 0), false];
  const count = s.numColumns;
  if (count === 0 ? column !== 0 : column < 0 || column >= count)
    throw new RangeError('table column port index out of range');
  let y = 0.5;
  if (count > 0) {
    const rowHeight = 1 / (count + 1);
    let percentage = rowHeight + rowHeight / 2;
    for (let i = 0; i < column; i++) percentage += rowHeight;
    percentage = Round(percentage * 10000) / 10000;
    y = TruncateDecimals(percentage);
  }
  const x = o === Orientation.Right ? 1 : 0,
    box = s.GetBox();
  return [
    new Point(
      box.TopLeft.X + Round(box.Width * x),
      box.TopLeft.Y + Round(box.Height * y),
    ),
    true,
  ];
}
