// Translated from internal/nodeshape/shape_parallelogram.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeParallelogram extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideMiddleCenter,
          Position.InsideBottomRight,
          Position.OutsideTopRight,
          Position.OutsideBottomLeft,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopCenter,
          Position.InsideTopCenter,
          Position.InsideBottomCenter,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightTop,
          Position.OutsideRightMiddle,
          Position.InsideTopRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.InsideBottomLeft,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideLeftTop,
          Position.OutsideRightBottom,
          Position.OutsideBottomRight,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let width = this.GetBox().Width;
    let wedgeWidth = 26.0;
    if (width < wedgeWidth) {
      wedgeWidth = width / 2.0;
    }

    return [
      [
        new RelativePoint(
          wedgeWidth / width + ((width - wedgeWidth) / width) * 0.25,
          0,
        ),
        new RelativePoint(
          wedgeWidth / width + ((width - wedgeWidth) / width) * 0.5,
          0,
        ),
        new RelativePoint(
          wedgeWidth / width + ((width - wedgeWidth) / width) * 0.75,
          0,
        ),
      ],

      [
        new RelativePoint((wedgeWidth / 2.0 + wedgeWidth) / 2.0 / width, 0.25),
        new RelativePoint(wedgeWidth / 2.0 / width, 0.5),
        new RelativePoint(wedgeWidth / 2.0 / 2.0 / width, 0.75),
      ],

      [
        new RelativePoint(((width - wedgeWidth) / width) * 0.25, 1),
        new RelativePoint(((width - wedgeWidth) / width) * 0.5, 1),
        new RelativePoint(((width - wedgeWidth) / width) * 0.75, 1),
      ],

      [
        new RelativePoint(
          (width - wedgeWidth) / width +
            (wedgeWidth / 2.0 + wedgeWidth) / 2.0 / width,
          0.25,
        ),
        new RelativePoint(
          (width - wedgeWidth) / width + wedgeWidth / 2.0 / width,
          0.5,
        ),
        new RelativePoint(
          (width - wedgeWidth) / width + wedgeWidth / 2.0 / 2.0 / width,
          0.75,
        ),
      ],
    ];
  }
}
