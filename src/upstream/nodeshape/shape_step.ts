// Translated from internal/nodeshape/shape_step.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeStep extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([Position.InsideMiddleCenter]);
      case LabelTier.OK:
        return new Set([
          Position.InsideTopCenter,
          Position.InsideTopRight,
          Position.InsideBottomRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.InsideBottomCenter,
          Position.OutsideTopLeft,
          Position.OutsideTopCenter,
          Position.OutsideBottomLeft,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideRightMiddle,
          Position.OutsideLeftTop,
          Position.OutsideLeftBottom,
          Position.InsideTopLeft,
          Position.InsideBottomLeft,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideTopRight,
          Position.OutsideLeftMiddle,
          Position.OutsideRightTop,
          Position.OutsideRightBottom,
          Position.OutsideBottomRight,
        ]);
      default:
        return new Set();
    }
  }
  SnapPointPercentages(): RelativePoint[][] {
    let width = this.GetBox().Width;
    let wedgeWidth = 35.0;
    if (width < wedgeWidth) {
      wedgeWidth = width / 2.0;
    }

    return [
      [
        new RelativePoint(((width - wedgeWidth) / width) * 0.25, 0),
        new RelativePoint(((width - wedgeWidth) / width) * 0.5, 0),
        new RelativePoint(((width - wedgeWidth) / width) * 0.75, 0),
      ],

      [
        new RelativePoint(wedgeWidth / width / 2, 0.25),
        new RelativePoint(wedgeWidth / width, 0.5),
        new RelativePoint(wedgeWidth / width / 2, 0.75),
      ],

      [
        new RelativePoint(((width - wedgeWidth) / width) * 0.25, 1),
        new RelativePoint(((width - wedgeWidth) / width) * 0.5, 1),
        new RelativePoint(((width - wedgeWidth) / width) * 0.75, 1),
      ],

      [new RelativePoint(1, 0.5)],
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
        return [9];
      case Orientation.TopLeft:
        return [0, 1, 2, 3, 4, 5];
      case Orientation.TopRight:
        return [0, 1, 2, 9];
      case Orientation.BottomLeft:
        return [6, 7, 8, 3, 4, 5];
      case Orientation.BottomRight:
        return [6, 7, 8, 9];
      default:
        return [];
    }
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [1, 7],
      [7, 1],
      [4, 9],
      [9, 4],
    ]);
  }
  CenterPortIndices(): number[] {
    return [1, 4, 7, 9];
  }
  CenterPortIndex(o: Orientation): number {
    const ports = this.CenterPortIndices();
    switch (o) {
      case Orientation.Top:
        return ports[0]!;
      case Orientation.Left:
        return ports[1]!;
      case Orientation.Bottom:
        return ports[2]!;
      case Orientation.Right:
        return ports[3]!;
      default:
        return -1;
    }
  }
}
