// Translated from internal/nodeshape/shape_person.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapePerson extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([Position.OutsideBottomCenter]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.InsideTopCenter,
          Position.InsideMiddleCenter,
          Position.InsideBottomCenter,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
          Position.OutsideLeftMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightMiddle,
          Position.OutsideRightBottom,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
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
      [
        new RelativePoint(0.21, 0.122),
        new RelativePoint(0.5, 0),
        new RelativePoint(0.79, 0.122),
      ],

      [new RelativePoint(0.135, 0.35), new RelativePoint(0.08, 0.75)],

      [
        new RelativePoint(0.25, 0.985),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 0.985),
      ],

      [new RelativePoint(0.865, 0.35), new RelativePoint(0.92, 0.75)],
    ];
  }
  PortIndices(orientation: Orientation): number[] {
    switch (orientation) {
      case Orientation.Top:
        return [0, 1, 2];
      case Orientation.Left:
        return [3, 4];
      case Orientation.Bottom:
        return [5, 6, 7];
      case Orientation.Right:
        return [8, 9];
      case Orientation.TopLeft:
        return [0, 1, 2, 3, 4];
      case Orientation.TopRight:
        return [0, 1, 2, 8, 9];
      case Orientation.BottomLeft:
        return [5, 6, 7, 3, 4];
      case Orientation.BottomRight:
        return [5, 6, 7, 8, 9];
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
    return [1, 3, 6, 8];
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
