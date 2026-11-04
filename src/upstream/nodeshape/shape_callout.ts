// Translated from internal/nodeshape/shape_callout.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { ShapePolicy, LabelTier } from './policy.js';
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import { Point, RelativePoint } from '../geo/point.js';
import { BezierCurve } from '../geo/bezier.js';
export class ShapeCallout extends ShapePolicy {
  LabelPositionPreferences(preferenceSet: LabelTier): Set<Position> {
    switch (preferenceSet) {
      case LabelTier.Good:
        return new Set([
          Position.InsideTopLeft,
          Position.InsideTopCenter,
          Position.InsideTopRight,
          Position.InsideMiddleLeft,
          Position.InsideMiddleCenter,
          Position.InsideMiddleRight,
          Position.InsideBottomLeft,
          Position.InsideBottomCenter,
          Position.InsideBottomRight,
        ]);
      case LabelTier.OK:
        return new Set([
          Position.OutsideTopLeft,
          Position.OutsideTopCenter,
          Position.OutsideTopRight,
          Position.OutsideBottomCenter,
        ]);
      case LabelTier.Unideal:
        return new Set([
          Position.OutsideLeftTop,
          Position.OutsideLeftMiddle,
          Position.OutsideRightTop,
          Position.OutsideRightMiddle,
        ]);
      case LabelTier.Bad:
        return new Set([
          Position.OutsideLeftBottom,
          Position.OutsideRightBottom,
          Position.OutsideBottomLeft,
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
    let tipWidth = 30.0;
    let tipHeight = 45.0;

    if (width < tipWidth * 2) {
      tipWidth = width / 2.0;
    }

    if (height < tipHeight * 2) {
      tipHeight = height / 2.0;
    }

    return [
      [
        new RelativePoint(0.25, 0),
        new RelativePoint(0.5, 0),
        new RelativePoint(0.75, 0),
      ],

      [
        new RelativePoint(0, ((height - tipHeight) / height) * 0.25),
        new RelativePoint(0, ((height - tipHeight) / height) * 0.5),
        new RelativePoint(0, ((height - tipHeight) / height) * 0.75),
      ],

      [
        new RelativePoint(0.5 * 0.33, (height - tipHeight) / height),
        new RelativePoint(0.5 * 0.66, (height - tipHeight) / height),
        new RelativePoint(0.5, 1),
        new RelativePoint(
          1 - ((width / 2.0 - tipWidth) / width) * 0.5,
          (height - tipHeight) / height,
        ),
      ],

      [
        new RelativePoint(1, ((height - tipHeight) / height) * 0.25),
        new RelativePoint(1, ((height - tipHeight) / height) * 0.5),
        new RelativePoint(1, ((height - tipHeight) / height) * 0.75),
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
        return [6, 7, 8, 9];
      case Orientation.Right:
        return [10, 11, 12];
      case Orientation.TopLeft:
        return [0, 1, 2, 3, 4, 5];
      case Orientation.TopRight:
        return [0, 1, 2, 10, 11, 12];
      case Orientation.BottomLeft:
        return [6, 7, 8, 9, 3, 4, 5];
      case Orientation.BottomRight:
        return [6, 7, 8, 9, 10, 11, 12];
      default:
        return [];
    }
  }
  CenterPortIndices(): number[] {
    return [1, 4, 8, 11];
  }
  MirroredPortIndices(): Map<number, number> {
    return new Map([
      [4, 11],
      [11, 4],
    ]);
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
