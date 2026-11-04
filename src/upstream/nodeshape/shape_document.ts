// Translated from internal/nodeshape/shape_document.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeDocument extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideTopCenter,
          Position.InsideTopRight,
          Position.InsideMiddleCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopCenter,
          Position.OutsideTopRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftTop,
          Position.OutsideLeftMiddle,
          Position.OutsideLeftBottom,
          Position.OutsideRightTop,
          Position.OutsideRightMiddle,
          Position.OutsideRightBottom,
          Position.InsideBottomCenter,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideBottomLeft,
          Position.OutsideBottomCenter,
          Position.OutsideBottomRight,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let box = this.GetBox();
    let width = box.Width;
    let height = box.Height;
    let bottomLeftMidpoint = new BezierCurve([
      new Point(0, height * (16.3 / 18.925)),
      new Point(width / 6, height * (19.8 / 18.925)),
      new Point(width / 3, height * (19.8 / 18.925)),
      new Point(width / 2, height * (16.3 / 18.925)),
    ]).At(0.5);
    let bottomRightCurve = new BezierCurve([
      new Point(width / 2, height * (16.3 / 18.925)),
      new Point((width * 2) / 3, height * (12.8 / 18.925)),
      new Point((width * 5) / 6, height * (12.8 / 18.925)),
      new Point(width, height * (16.3 / 18.925)),
    ]);
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
        new RelativePoint(
          bottomLeftMidpoint.X / width,
          bottomLeftMidpoint.Y / height,
        ),
        new RelativePoint(
          bottomRightCurve.At(0).X / width,
          bottomRightCurve.At(0).Y / height,
        ),
        new RelativePoint(
          bottomRightCurve.At(0.5).X / width,
          bottomRightCurve.At(0.5).Y / height,
        ),
      ],

      [
        new RelativePoint(1, 0.25),
        new RelativePoint(1, 0.5),
        new RelativePoint(1, 0.75),
      ],
    ];
  }
}
