// Translated from internal/nodeshape/shape_circle.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeCircle extends ShapeSquare {
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
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
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
        ]);
      default:
        return new Set();
    }
  }
}
