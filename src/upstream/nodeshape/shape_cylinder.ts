// Translated from internal/nodeshape/shape_cylinder.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
import { ShapeSquare } from './shape_square.js';
export class ShapeCylinder extends ShapeSquare {
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
          Position.InsideTopCenter,
          Position.InsideBottomCenter,
          Position.InsideMiddleLeft,
          Position.OutsideTopRight,
          Position.OutsideBottomRight,
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.OutsideTopLeft,
          Position.OutsideBottomLeft,
          Position.InsideTopLeft,
          Position.InsideBottomLeft,
          Position.InsideMiddleRight,
          Position.InsideTopRight,
          Position.InsideBottomRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
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
  SnapPointPercentages(): RelativePoint[][] {
    let box = this.GetBox();
    let width = box.Width;
    let height = box.Height;
    let arcDepth = 24.0;
    let controlPointsMultiplier = 0.45;

    if (height < arcDepth * 2) {
      arcDepth = height / 2.0;
    }

    let topLeftMidpoint = new BezierCurve([
      new Point(0, arcDepth),
      new Point(0, 0),
      new Point(width * controlPointsMultiplier, 0),
      new Point(width / 2.0, 0),
    ]).At(0.5);
    let topRightMidpoint = new BezierCurve([
      new Point(width / 2.0, 0),
      new Point(width - width * controlPointsMultiplier, 0),
      new Point(width, 0),
      new Point(width, arcDepth),
    ]).At(0.5);
    let bottomRightMidpoint = new BezierCurve([
      new Point(width, height - arcDepth),
      new Point(width, height),
      new Point(width - width * controlPointsMultiplier, height),
      new Point(width / 2.0, height),
    ]).At(0.5);
    let bottomLeftMidpoint = new BezierCurve([
      new Point(width / 2.0, height),
      new Point(width * controlPointsMultiplier, height),
      new Point(0, height),
      new Point(0, height - arcDepth),
    ]).At(0.5);

    return [
      [
        new RelativePoint(
          topLeftMidpoint.X / width,
          topLeftMidpoint.Y / height,
        ),
        new RelativePoint(0.5, 0),
        new RelativePoint(
          topRightMidpoint.X / width,
          topRightMidpoint.Y / height,
        ),
      ],

      [
        new RelativePoint(
          0,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.25,
        ),
        new RelativePoint(
          0,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.5,
        ),
        new RelativePoint(
          0,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.75,
        ),
      ],

      [
        new RelativePoint(
          bottomLeftMidpoint.X / width,
          bottomLeftMidpoint.Y / height,
        ),
        new RelativePoint(0.5, 1),
        new RelativePoint(
          bottomRightMidpoint.X / width,
          bottomRightMidpoint.Y / height,
        ),
      ],

      [
        new RelativePoint(
          1,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.25,
        ),
        new RelativePoint(
          1,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.5,
        ),
        new RelativePoint(
          1,
          arcDepth / height + ((height - arcDepth * 2) / height) * 0.75,
        ),
      ],
    ];
  }
}
