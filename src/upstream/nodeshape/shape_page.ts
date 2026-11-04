// Translated from internal/nodeshape/shape_page.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapePage extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideMiddleCenter,
          Position.InsideBottomCenter,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
          Position.OutsideTopLeft,
          Position.OutsideTopCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideTopRight,
          Position.InsideTopCenter,
          Position.OutsideRightBottom,
          Position.OutsideRightMiddle,
          Position.OutsideLeftTop,
          Position.OutsideLeftMiddle,
          Position.OutsideLeftBottom,
        ]);
      case LabelTier.Bad:
        return new Set([Position.InsideTopRight, Position.OutsideRightTop]);
      default:
        return new Set();
    }
  }
}
