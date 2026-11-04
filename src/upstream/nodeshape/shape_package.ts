// Translated from internal/nodeshape/shape_package.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapePackage extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideMiddleCenter,
          Position.InsideMiddleLeft,
          Position.InsideBottomLeft,
          Position.InsideBottomCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomCenter,
          Position.InsideTopLeft,
          Position.InsideTopCenter,
          Position.InsideTopRight,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopLeft,
          Position.InsideMiddleRight,
          Position.InsideBottomRight,
          Position.OutsideBottomRight,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideTopCenter,
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.OutsideLeftTop,
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
        ]);
      case LabelTier.Bad:
        return new Set([Position.OutsideTopRight, Position.OutsideRightTop]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let box = this.GetBox();
    let width = box.Width;
    let height = box.Height;
    let verticalScalar = 0.2;
    let horizontalScalar = 0.5;
    let minTopHeight = 34.0;
    let maxTopHeight = 55.0;

    let minTopWidth = 50.0;
    let maxTopWidth = 150.0;

    let topWidth = Math.min(
      maxTopWidth,
      Math.max(minTopWidth, width * horizontalScalar),
    );

    if (width < 2 * minTopWidth) {
      topWidth = width * horizontalScalar;
    }

    let topHeight = Math.min(
      maxTopHeight,
      Math.max(minTopHeight, height * verticalScalar),
    );

    if (height < 2 * minTopHeight) {
      topHeight = height * verticalScalar;
    }

    let topWidthRatio = topWidth / width;
    let topHeightRatio = topHeight / height;

    let negativeTopWidthRatio = 1 - topWidthRatio;
    let negativeTopHeightRatio = 1 - topHeightRatio;

    return [
      [
        new RelativePoint(topWidthRatio * 0.33, 0),
        new RelativePoint(topWidthRatio * 0.66, 0),
        new RelativePoint(
          topWidthRatio + negativeTopWidthRatio * 0.5,
          topHeightRatio,
        ),
      ],

      [
        new RelativePoint(0, topHeightRatio + negativeTopHeightRatio * 0.25),
        new RelativePoint(0, topHeightRatio + negativeTopHeightRatio * 0.5),
        new RelativePoint(0, topHeightRatio + negativeTopHeightRatio * 0.75),
      ],

      [
        new RelativePoint(0.25, 1),
        new RelativePoint(0.5, 1),
        new RelativePoint(0.75, 1),
      ],

      [
        new RelativePoint(1, topHeightRatio + negativeTopHeightRatio * 0.25),
        new RelativePoint(1, topHeightRatio + negativeTopHeightRatio * 0.5),
        new RelativePoint(1, topHeightRatio + negativeTopHeightRatio * 0.75),
      ],
    ];
  }
  PortIndices(orientation: Orientation): number[] {
    switch (orientation) {
      case Orientation.Top:
        return [0, 1, 2];
      case Orientation.Left:
        return [3, 4, 5];
      case Orientation.Bottom:
        return [6, 7, 8];
      case Orientation.Right:
        return [9, 10, 11];
      case Orientation.TopLeft:
        return [0, 1, 2, 3, 4, 5];
      case Orientation.TopRight:
        return [0, 1, 2, 9, 10, 11];
      case Orientation.BottomLeft:
        return [6, 7, 8, 3, 4, 5];
      case Orientation.BottomRight:
        return [6, 7, 8, 9, 10, 11];
      default:
        return [];
    }
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [4, 10],
      [10, 4],
    ]);
  }
  CenterPortIndices(): number[] {
    return [0, 1, 4, 7, 10];
  }
  CenterPortIndex(o: Orientation): number {
    const ports = this.CenterPortIndices();
    switch (o) {
      case Orientation.Top:
        return ports[1]!;
      case Orientation.Left:
        return ports[2]!;
      case Orientation.Bottom:
        return ports[3]!;
      case Orientation.Right:
        return ports[4]!;
      default:
        return -1;
    }
  }
}
