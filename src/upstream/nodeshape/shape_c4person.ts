// Translated from internal/nodeshape/shape_c4person.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeC4Person extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([Position.InsideMiddleCenter]);
      case LabelTier.OK:
        return new Set([Position.InsideTopCenter, Position.InsideBottomCenter]);
      case LabelTier.Unideal:
        return new Set([
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopCenter,
          Position.OutsideBottomCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
          Position.OutsideLeftMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightMiddle,
          Position.OutsideRightBottom,
          Position.OutsideRightTop,
          Position.OutsideLeftTop,
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    return [
      [new RelativePoint(0.5, 0)],

      [
        new RelativePoint(0, 0.45),
        new RelativePoint(0, 0.65),
        new RelativePoint(0, 0.85),
      ],

      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],

      [
        new RelativePoint(1, 0.45),
        new RelativePoint(1, 0.65),
        new RelativePoint(1, 0.85),
      ],
    ];
  }
  PortIndices(orientation: Orientation): number[] {
    switch (orientation) {
      case Orientation.Top:
        return [0];
      case Orientation.Left:
        return [1, 2, 3];
      case Orientation.Bottom:
        return [4, 5, 6];
      case Orientation.Right:
        return [7, 8, 9];
      case Orientation.TopLeft:
        return [0, 1, 2, 3];
      case Orientation.TopRight:
        return [0, 7, 8, 9];
      case Orientation.BottomLeft:
        return [4, 5, 6, 1, 2, 3];
      case Orientation.BottomRight:
        return [4, 5, 6, 7, 8, 9];
      default:
        return [];
    }
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [1, 6],
      [6, 1],
      [3, 8],
      [8, 3],
    ]);
  }
  CenterPortIndices(): number[] {
    return [0, 2, 5, 7];
  }
  CenterPortIndex(o: Orientation): number {
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
}
