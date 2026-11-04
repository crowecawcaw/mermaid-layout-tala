// Translated from internal/nodeshape/shape_stored_data.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeStoredData extends ShapeSquare {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.OutsideTopCenter,
          Position.InsideTopCenter,
          Position.InsideMiddleCenter,
          Position.InsideBottomCenter,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopRight,
          Position.OutsideBottomRight,
          Position.InsideTopRight,
          Position.InsideBottomRight,
          Position.InsideMiddleRight,
          Position.InsideTopLeft,
          Position.InsideBottomLeft,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.InsideMiddleLeft,
          Position.OutsideLeftMiddle,
          Position.OutsideTopLeft,
          Position.OutsideBottomLeft,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideRightMiddle,
          Position.OutsideLeftTop,
          Position.OutsideRightTop,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let box = this.GetBox();
    let width = box.Width;
    let height = box.Height;
    let wedgeWidth = 15.0;
    if (width < wedgeWidth) {
      wedgeWidth = width / 2;
    }
    let controlPointsMultiplier = 0.27;

    let topLeftMidpoint = new BezierCurve([
      new Point(wedgeWidth, 0.0),
      new Point(wedgeWidth - wedgeWidth * controlPointsMultiplier, 0.0),
      new Point(0.0, height * controlPointsMultiplier),
      new Point(0.0, height / 2.0),
    ]).At(0.5);

    let bottomLeftMidpoint = new BezierCurve([
      new Point(wedgeWidth, height),
      new Point(wedgeWidth - wedgeWidth * controlPointsMultiplier, height),
      new Point(0.0, height - height * controlPointsMultiplier),
      new Point(0.0, height / 2.0),
    ]).At(0.5);

    let topRightMidpoint = new BezierCurve([
      new Point(width, 0),
      new Point(width - wedgeWidth * controlPointsMultiplier, 0),
      new Point(width - wedgeWidth, height * controlPointsMultiplier),
      new Point(width - wedgeWidth, height / 2.0),
    ]).At(0.5);

    let bottomRightMidpoint = new BezierCurve([
      new Point(width - wedgeWidth, height / 2.0),
      new Point(width - wedgeWidth, height - height * controlPointsMultiplier),
      new Point(width - wedgeWidth * controlPointsMultiplier, height),
      new Point(width, height),
    ]).At(0.5);

    let sideWidthPercentage = (width - wedgeWidth) / width;
    let sideWidthStartPercentage = 1 - sideWidthPercentage;

    return [
      [
        new RelativePoint(
          sideWidthStartPercentage + 0.25 * sideWidthPercentage,
          0,
        ),
        new RelativePoint(
          sideWidthStartPercentage + 0.5 * sideWidthPercentage,
          0,
        ),
        new RelativePoint(
          sideWidthStartPercentage + 0.75 * sideWidthPercentage,
          0,
        ),
      ],

      [
        new RelativePoint(
          topLeftMidpoint.X / width,
          topLeftMidpoint.Y / height,
        ),
        new RelativePoint(0.0, 0.5),
        new RelativePoint(
          bottomLeftMidpoint.X / width,
          bottomLeftMidpoint.Y / height,
        ),
      ],

      [
        new RelativePoint(
          sideWidthStartPercentage + 0.25 * sideWidthPercentage,
          1,
        ),
        new RelativePoint(
          sideWidthStartPercentage + 0.5 * sideWidthPercentage,
          1,
        ),
        new RelativePoint(
          sideWidthStartPercentage + 0.75 * sideWidthPercentage,
          1,
        ),
      ],

      [
        new RelativePoint(
          topRightMidpoint.X / width,
          topRightMidpoint.Y / height,
        ),
        new RelativePoint((width - wedgeWidth) / width, 0.5),
        new RelativePoint(
          bottomRightMidpoint.X / width,
          bottomRightMidpoint.Y / height,
        ),
      ],
    ];
  }
}
