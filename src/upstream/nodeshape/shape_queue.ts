// Translated from internal/nodeshape/shape_queue.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeQueue extends ShapeSquare {
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
          Position.InsideTopLeft,
          Position.InsideBottomLeft,
          Position.InsideMiddleRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.InsideTopRight,
          Position.InsideBottomRight,
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.InsideMiddleLeft,
        ]);
      case LabelTier.Bad:
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
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let box = this.GetBox();
    let width = box.Width;
    let height = box.Height;
    let arcDepth = 24.0;
    let controlPointsMultiplier = 0.45;

    if (width < arcDepth * 2) {
      arcDepth = width / 2.0;
    }

    let topLeftMidpoint = new BezierCurve([
      new Point(arcDepth, 0),
      new Point(0, 0),
      new Point(0, height * controlPointsMultiplier),
      new Point(0, height / 2.0),
    ]).At(0.5);
    let topRightMidpoint = new BezierCurve([
      new Point(width - arcDepth, 0),
      new Point(width, 0),
      new Point(width, height * controlPointsMultiplier),
      new Point(width, height / 2.0),
    ]).At(0.5);
    let bottomRightMidpoint = new BezierCurve([
      new Point(width, height / 2.0),
      new Point(width, height - height * controlPointsMultiplier),
      new Point(width, height),
      new Point(width - arcDepth, height),
    ]).At(0.5);
    let bottomLeftMidpoint = new BezierCurve([
      new Point(0, height / 2.0),
      new Point(0, height - height * controlPointsMultiplier),
      new Point(0, height),
      new Point(arcDepth, height),
    ]).At(0.5);

    return [
      [
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.25,
          0,
        ),
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.5,
          0,
        ),
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.75,
          0,
        ),
      ],

      [
        new RelativePoint(
          topLeftMidpoint.X / width,
          topLeftMidpoint.Y / height,
        ),
        new RelativePoint(0, 0.5),
        new RelativePoint(
          bottomLeftMidpoint.X / width,
          bottomLeftMidpoint.Y / height,
        ),
      ],

      [
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.25,
          1,
        ),
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.5,
          1,
        ),
        new RelativePoint(
          arcDepth / width + ((width - arcDepth * 2) / width) * 0.75,
          1,
        ),
      ],

      [
        new RelativePoint(
          topRightMidpoint.X / width,
          topRightMidpoint.Y / height,
        ),
        new RelativePoint(1, 0.5),
        new RelativePoint(
          bottomRightMidpoint.X / width,
          bottomRightMidpoint.Y / height,
        ),
      ],
    ];
  }
}
