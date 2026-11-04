// Translated from internal/nodeshape/shape_hexagon.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeHexagon extends ShapeSquare {
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
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.InsideTopCenter,
          Position.InsideBottomCenter,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
          Position.OutsideLeftTop,
          Position.OutsideLeftBottom,
          Position.OutsideRightTop,
          Position.OutsideRightBottom,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
        ]);
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
        new RelativePoint(0.125, 0.25),
        new RelativePoint(0, 0.5),
        new RelativePoint(0.125, 0.75),
      ],

      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],

      [
        new RelativePoint(0.875, 0.25),
        new RelativePoint(1, 0.5),
        new RelativePoint(0.875, 0.75),
      ],
    ];
  }
}
