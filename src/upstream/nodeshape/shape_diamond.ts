// Translated from internal/nodeshape/shape_diamond.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeDiamond extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([Position.InsideMiddleCenter]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopCenter,
          Position.OutsideBottomCenter,
          Position.InsideMiddleLeft,
          Position.InsideMiddleRight,
          Position.OutsideLeftMiddle,
          Position.OutsideRightMiddle,
          Position.InsideBottomCenter,
          Position.InsideTopCenter,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideTopRight,
          Position.InsideBottomLeft,
          Position.InsideBottomRight,
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
  SnapPointPercentages(): RelativePoint[][] {
    return [
      [new RelativePoint(0.5, 0)],

      [new RelativePoint(0, 0.5)],

      [new RelativePoint(0.5, 1)],

      [new RelativePoint(1, 0.5)],
    ];
  }
  PortIndices(orientation: Orientation): number[] {
    switch (orientation) {
      case Orientation.Top:
        return [0];
      case Orientation.Left:
        return [1];
      case Orientation.Bottom:
        return [2];
      case Orientation.Right:
        return [3];
      case Orientation.TopLeft:
        return [0, 1];
      case Orientation.TopRight:
        return [0, 3];
      case Orientation.BottomLeft:
        return [2, 1];
      case Orientation.BottomRight:
        return [2, 3];
      default:
        return [];
    }
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [0, 2],
      [2, 0],
      [1, 3],
      [3, 1],
    ]);
  }
  CenterPortIndices(): number[] {
    return [0, 1, 2, 3];
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
