// Translated from internal/nodeshape/shape_square.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeSquare extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.OutsideTopCenter,
          Position.InsideTopCenter,
          Position.InsideMiddleCenter,
          Position.InsideBottomCenter,
          Position.OutsideBottomCenter,
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftTop,
          Position.OutsideRightTop,
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
        ]);
      case LabelTier.Bad:
        return new Set([]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    return [
      [
        new RelativePoint(0.25, 0),
        new RelativePoint(0.5, 0),
        new RelativePoint(0.75, 0),
      ],

      [
        new RelativePoint(0, 0.25),
        new RelativePoint(0, 0.5),
        new RelativePoint(0, 0.75),
      ],

      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],

      [
        new RelativePoint(1, 0.25),
        new RelativePoint(1, 0.5),
        new RelativePoint(1, 0.75),
      ],
    ];
  }
  PortIndices(orientation: Orientation): number[] {
    switch (orientation) {
      case Orientation.Top:
        return [0, 1, 2];
      case Orientation.Left:
        return [3, 4, 5];
      case Orientation.Bottom:
        return [6, 7, 8];
      case Orientation.Right:
        return [9, 10, 11];
      case Orientation.TopLeft:
        return [0, 1, 2, 3, 4, 5];
      case Orientation.TopRight:
        return [0, 1, 2, 9, 10, 11];
      case Orientation.BottomLeft:
        return [6, 7, 8, 3, 4, 5];
      case Orientation.BottomRight:
        return [6, 7, 8, 9, 10, 11];
      default:
        return [];
    }
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [1, 7],
      [7, 1],
      [4, 10],
      [10, 4],
    ]);
  }
  CenterPortIndices(): number[] {
    return [1, 4, 7, 10];
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
