// Translated from internal/nodeshape/shape_cloud.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeCloud extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideMiddleCenter,
          Position.InsideBottomCenter,
          Position.OutsideBottomCenter,
          Position.InsideTopCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
          Position.OutsideLeftTop,
          Position.OutsideRightTop,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    return [
      [
        new RelativePoint(0.16, 0.368),
        new RelativePoint(0.378, 0.155),
        new RelativePoint(0.815, 0.328),
      ],

      [new RelativePoint(0, 0.7), new RelativePoint(0.066, 0.935)],

      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],

      [new RelativePoint(1, 0.7), new RelativePoint(0.95, 0.89)],
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
