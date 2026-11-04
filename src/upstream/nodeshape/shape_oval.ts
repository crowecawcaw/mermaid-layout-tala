// Translated from internal/nodeshape/shape_oval.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeOval extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.OutsideTopCenter,
          Position.InsideMiddleCenter,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.InsideBottomCenter,
          Position.InsideTopCenter,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
          Position.OutsideLeftTop,
          Position.OutsideRightTop,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    return [
      [
        new RelativePoint(0.25, 0.066),
        new RelativePoint(0.5, 0),
        new RelativePoint(0.75, 0.066),
      ],

      [
        new RelativePoint(0.066, 0.25),
        new RelativePoint(0, 0.5),
        new RelativePoint(0.066, 0.75),
      ],

      [
        new RelativePoint(0.25, 0.934),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 0.934),
      ],

      [
        new RelativePoint(0.934, 0.25),
        new RelativePoint(1, 0.5),
        new RelativePoint(0.934, 0.75),
      ],
    ];
  }
}
