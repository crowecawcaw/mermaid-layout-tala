// Translated from internal/nodeshape/shape_image.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeImage extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.OutsideBottomCenter,
          Position.OutsideTopCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopRight,
          Position.OutsideBottomLeft,
          Position.OutsideBottomRight,
          Position.OutsideLeftTop,
          Position.OutsideRightTop,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
        ]);
      case LabelTier.Bad:
        return new Set([]);
      default:
        return new Set();
    }
  }
}
