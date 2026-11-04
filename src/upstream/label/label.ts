// Translated from D2 lib/label/label.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import type { Box } from '../geo/box.js';
import { Route } from '../geo/route.js';
import { Round } from '../geo/math.js';
import { GetUnitNormalVector } from '../geo/vector.js';
export const LEFT_LABEL_POSITION = 1 / 4,
  CENTER_LABEL_POSITION = 2 / 4,
  RIGHT_LABEL_POSITION = 3 / 4,
  PADDING = 5;
export enum Position {
  Unset,
  OutsideTopLeft,
  OutsideTopCenter,
  OutsideTopRight,
  OutsideLeftTop,
  OutsideLeftMiddle,
  OutsideLeftBottom,
  OutsideRightTop,
  OutsideRightMiddle,
  OutsideRightBottom,
  OutsideBottomLeft,
  OutsideBottomCenter,
  OutsideBottomRight,
  InsideTopLeft,
  InsideTopCenter,
  InsideTopRight,
  InsideMiddleLeft,
  InsideMiddleCenter,
  InsideMiddleRight,
  InsideBottomLeft,
  InsideBottomCenter,
  InsideBottomRight,
  BorderTopLeft,
  BorderTopCenter,
  BorderTopRight,
  BorderLeftTop,
  BorderLeftMiddle,
  BorderLeftBottom,
  BorderRightTop,
  BorderRightMiddle,
  BorderRightBottom,
  BorderBottomLeft,
  BorderBottomCenter,
  BorderBottomRight,
  UnlockedTop,
  UnlockedMiddle,
  UnlockedBottom,
}
export function FromString(s: string): Position {
  switch (s) {
    case 'OUTSIDE_TOP_LEFT':
      return Position.OutsideTopLeft;
    case 'OUTSIDE_TOP_CENTER':
      return Position.OutsideTopCenter;
    case 'OUTSIDE_TOP_RIGHT':
      return Position.OutsideTopRight;

    case 'OUTSIDE_LEFT_TOP':
      return Position.OutsideLeftTop;
    case 'OUTSIDE_LEFT_MIDDLE':
      return Position.OutsideLeftMiddle;
    case 'OUTSIDE_LEFT_BOTTOM':
      return Position.OutsideLeftBottom;

    case 'OUTSIDE_RIGHT_TOP':
      return Position.OutsideRightTop;
    case 'OUTSIDE_RIGHT_MIDDLE':
      return Position.OutsideRightMiddle;
    case 'OUTSIDE_RIGHT_BOTTOM':
      return Position.OutsideRightBottom;

    case 'OUTSIDE_BOTTOM_LEFT':
      return Position.OutsideBottomLeft;
    case 'OUTSIDE_BOTTOM_CENTER':
      return Position.OutsideBottomCenter;
    case 'OUTSIDE_BOTTOM_RIGHT':
      return Position.OutsideBottomRight;

    case 'INSIDE_TOP_LEFT':
      return Position.InsideTopLeft;
    case 'INSIDE_TOP_CENTER':
      return Position.InsideTopCenter;
    case 'INSIDE_TOP_RIGHT':
      return Position.InsideTopRight;

    case 'INSIDE_MIDDLE_LEFT':
      return Position.InsideMiddleLeft;
    case 'INSIDE_MIDDLE_CENTER':
      return Position.InsideMiddleCenter;
    case 'INSIDE_MIDDLE_RIGHT':
      return Position.InsideMiddleRight;

    case 'INSIDE_BOTTOM_LEFT':
      return Position.InsideBottomLeft;
    case 'INSIDE_BOTTOM_CENTER':
      return Position.InsideBottomCenter;
    case 'INSIDE_BOTTOM_RIGHT':
      return Position.InsideBottomRight;

    case 'BORDER_TOP_LEFT':
      return Position.BorderTopLeft;
    case 'BORDER_TOP_CENTER':
      return Position.BorderTopCenter;
    case 'BORDER_TOP_RIGHT':
      return Position.BorderTopRight;

    case 'BORDER_LEFT_TOP':
      return Position.BorderLeftTop;
    case 'BORDER_LEFT_MIDDLE':
      return Position.BorderLeftMiddle;
    case 'BORDER_LEFT_BOTTOM':
      return Position.BorderLeftBottom;

    case 'BORDER_RIGHT_TOP':
      return Position.BorderRightTop;
    case 'BORDER_RIGHT_MIDDLE':
      return Position.BorderRightMiddle;
    case 'BORDER_RIGHT_BOTTOM':
      return Position.BorderRightBottom;

    case 'BORDER_BOTTOM_LEFT':
      return Position.BorderBottomLeft;
    case 'BORDER_BOTTOM_CENTER':
      return Position.BorderBottomCenter;
    case 'BORDER_BOTTOM_RIGHT':
      return Position.BorderBottomRight;

    case 'UNLOCKED_TOP':
      return Position.UnlockedTop;
    case 'UNLOCKED_MIDDLE':
      return Position.UnlockedMiddle;
    case 'UNLOCKED_BOTTOM':
      return Position.UnlockedBottom;
    default:
      return Position.Unset;
  }
}
export function String(position: Position): string {
  switch (position) {
    case Position.OutsideTopLeft:
      return 'OUTSIDE_TOP_LEFT';
    case Position.OutsideTopCenter:
      return 'OUTSIDE_TOP_CENTER';
    case Position.OutsideTopRight:
      return 'OUTSIDE_TOP_RIGHT';

    case Position.OutsideLeftTop:
      return 'OUTSIDE_LEFT_TOP';
    case Position.OutsideLeftMiddle:
      return 'OUTSIDE_LEFT_MIDDLE';
    case Position.OutsideLeftBottom:
      return 'OUTSIDE_LEFT_BOTTOM';

    case Position.OutsideRightTop:
      return 'OUTSIDE_RIGHT_TOP';
    case Position.OutsideRightMiddle:
      return 'OUTSIDE_RIGHT_MIDDLE';
    case Position.OutsideRightBottom:
      return 'OUTSIDE_RIGHT_BOTTOM';

    case Position.OutsideBottomLeft:
      return 'OUTSIDE_BOTTOM_LEFT';
    case Position.OutsideBottomCenter:
      return 'OUTSIDE_BOTTOM_CENTER';
    case Position.OutsideBottomRight:
      return 'OUTSIDE_BOTTOM_RIGHT';

    case Position.InsideTopLeft:
      return 'INSIDE_TOP_LEFT';
    case Position.InsideTopCenter:
      return 'INSIDE_TOP_CENTER';
    case Position.InsideTopRight:
      return 'INSIDE_TOP_RIGHT';

    case Position.InsideMiddleLeft:
      return 'INSIDE_MIDDLE_LEFT';
    case Position.InsideMiddleCenter:
      return 'INSIDE_MIDDLE_CENTER';
    case Position.InsideMiddleRight:
      return 'INSIDE_MIDDLE_RIGHT';

    case Position.InsideBottomLeft:
      return 'INSIDE_BOTTOM_LEFT';
    case Position.InsideBottomCenter:
      return 'INSIDE_BOTTOM_CENTER';
    case Position.InsideBottomRight:
      return 'INSIDE_BOTTOM_RIGHT';

    case Position.BorderTopLeft:
      return 'BORDER_TOP_LEFT';
    case Position.BorderTopCenter:
      return 'BORDER_TOP_CENTER';
    case Position.BorderTopRight:
      return 'BORDER_TOP_RIGHT';

    case Position.BorderLeftTop:
      return 'BORDER_LEFT_TOP';
    case Position.BorderLeftMiddle:
      return 'BORDER_LEFT_MIDDLE';
    case Position.BorderLeftBottom:
      return 'BORDER_LEFT_BOTTOM';

    case Position.BorderRightTop:
      return 'BORDER_RIGHT_TOP';
    case Position.BorderRightMiddle:
      return 'BORDER_RIGHT_MIDDLE';
    case Position.BorderRightBottom:
      return 'BORDER_RIGHT_BOTTOM';

    case Position.BorderBottomLeft:
      return 'BORDER_BOTTOM_LEFT';
    case Position.BorderBottomCenter:
      return 'BORDER_BOTTOM_CENTER';
    case Position.BorderBottomRight:
      return 'BORDER_BOTTOM_RIGHT';

    case Position.UnlockedTop:
      return 'UNLOCKED_TOP';
    case Position.UnlockedMiddle:
      return 'UNLOCKED_MIDDLE';
    case Position.UnlockedBottom:
      return 'UNLOCKED_BOTTOM';

    default:
      return '';
  }
}
export function IsShapePosition(position: Position): boolean {
  switch (position) {
    case Position.OutsideTopLeft:
    case Position.OutsideTopCenter:
    case Position.OutsideTopRight:
    case Position.OutsideBottomLeft:
    case Position.OutsideBottomCenter:
    case Position.OutsideBottomRight:
    case Position.OutsideLeftTop:
    case Position.OutsideLeftMiddle:
    case Position.OutsideLeftBottom:
    case Position.OutsideRightTop:
    case Position.OutsideRightMiddle:
    case Position.OutsideRightBottom:
    case Position.InsideTopLeft:
    case Position.InsideTopCenter:
    case Position.InsideTopRight:
    case Position.InsideMiddleLeft:
    case Position.InsideMiddleCenter:
    case Position.InsideMiddleRight:
    case Position.InsideBottomLeft:
    case Position.InsideBottomCenter:
    case Position.InsideBottomRight:
    case Position.BorderTopLeft:
    case Position.BorderTopCenter:
    case Position.BorderTopRight:
    case Position.BorderLeftTop:
    case Position.BorderLeftMiddle:
    case Position.BorderLeftBottom:
    case Position.BorderRightTop:
    case Position.BorderRightMiddle:
    case Position.BorderRightBottom:
    case Position.BorderBottomLeft:
    case Position.BorderBottomCenter:
    case Position.BorderBottomRight:
      return true;
    default:
      return false;
  }
}
export function IsEdgePosition(position: Position): boolean {
  switch (position) {
    case Position.OutsideTopLeft:
    case Position.OutsideTopCenter:
    case Position.OutsideTopRight:
    case Position.InsideMiddleLeft:
    case Position.InsideMiddleCenter:
    case Position.InsideMiddleRight:
    case Position.OutsideBottomLeft:
    case Position.OutsideBottomCenter:
    case Position.OutsideBottomRight:
    case Position.UnlockedTop:
    case Position.UnlockedMiddle:
    case Position.UnlockedBottom:
      return true;
    default:
      return false;
  }
}
export function IsOutside(position: Position): boolean {
  switch (position) {
    case Position.OutsideTopLeft:
    case Position.OutsideTopCenter:
    case Position.OutsideTopRight:
    case Position.OutsideBottomLeft:
    case Position.OutsideBottomCenter:
    case Position.OutsideBottomRight:
    case Position.OutsideLeftTop:
    case Position.OutsideLeftMiddle:
    case Position.OutsideLeftBottom:
    case Position.OutsideRightTop:
    case Position.OutsideRightMiddle:
    case Position.OutsideRightBottom:
      return true;
    default:
      return false;
  }
}
export function IsUnlocked(position: Position): boolean {
  switch (position) {
    case Position.UnlockedTop:
    case Position.UnlockedMiddle:
    case Position.UnlockedBottom:
      return true;
    default:
      return false;
  }
}
export function IsBorder(position: Position): boolean {
  switch (position) {
    case Position.BorderTopLeft:
    case Position.BorderTopCenter:
    case Position.BorderTopRight:
    case Position.BorderLeftTop:
    case Position.BorderLeftMiddle:
    case Position.BorderLeftBottom:
    case Position.BorderRightTop:
    case Position.BorderRightMiddle:
    case Position.BorderRightBottom:
    case Position.BorderBottomLeft:
    case Position.BorderBottomCenter:
    case Position.BorderBottomRight:
      return true;
    default:
      return false;
  }
}
export function IsOnEdge(position: Position): boolean {
  switch (position) {
    case Position.InsideMiddleLeft:
    case Position.InsideMiddleCenter:
    case Position.InsideMiddleRight:
    case Position.UnlockedMiddle:
      return true;
    default:
      return false;
  }
}
export function Mirrored(position: Position): Position {
  switch (position) {
    case Position.OutsideTopLeft:
      return Position.OutsideBottomRight;
    case Position.OutsideTopCenter:
      return Position.OutsideBottomCenter;
    case Position.OutsideTopRight:
      return Position.OutsideBottomLeft;

    case Position.OutsideLeftTop:
      return Position.OutsideRightBottom;
    case Position.OutsideLeftMiddle:
      return Position.OutsideRightMiddle;
    case Position.OutsideLeftBottom:
      return Position.OutsideRightTop;

    case Position.OutsideRightTop:
      return Position.OutsideLeftBottom;
    case Position.OutsideRightMiddle:
      return Position.OutsideLeftMiddle;
    case Position.OutsideRightBottom:
      return Position.OutsideLeftTop;

    case Position.OutsideBottomLeft:
      return Position.OutsideTopRight;
    case Position.OutsideBottomCenter:
      return Position.OutsideTopCenter;
    case Position.OutsideBottomRight:
      return Position.OutsideTopLeft;

    case Position.InsideTopLeft:
      return Position.InsideBottomRight;
    case Position.InsideTopCenter:
      return Position.InsideBottomCenter;
    case Position.InsideTopRight:
      return Position.InsideBottomLeft;

    case Position.InsideMiddleLeft:
      return Position.InsideMiddleRight;
    case Position.InsideMiddleCenter:
      return Position.InsideMiddleCenter;
    case Position.InsideMiddleRight:
      return Position.InsideMiddleLeft;

    case Position.InsideBottomLeft:
      return Position.InsideTopRight;
    case Position.InsideBottomCenter:
      return Position.InsideTopCenter;
    case Position.InsideBottomRight:
      return Position.InsideTopLeft;

    case Position.BorderTopLeft:
      return Position.BorderBottomRight;
    case Position.BorderTopCenter:
      return Position.BorderBottomCenter;
    case Position.BorderTopRight:
      return Position.BorderBottomLeft;

    case Position.BorderLeftTop:
      return Position.BorderRightBottom;
    case Position.BorderLeftMiddle:
      return Position.BorderRightMiddle;
    case Position.BorderLeftBottom:
      return Position.BorderRightTop;

    case Position.BorderRightTop:
      return Position.BorderLeftBottom;
    case Position.BorderRightMiddle:
      return Position.BorderLeftMiddle;
    case Position.BorderRightBottom:
      return Position.BorderLeftTop;

    case Position.BorderBottomLeft:
      return Position.BorderTopRight;
    case Position.BorderBottomCenter:
      return Position.BorderTopCenter;
    case Position.BorderBottomRight:
      return Position.BorderTopLeft;

    case Position.UnlockedTop:
      return Position.UnlockedBottom;
    case Position.UnlockedBottom:
      return Position.UnlockedTop;
    case Position.UnlockedMiddle:
      return Position.UnlockedMiddle;

    default:
      return Position.Unset;
  }
}
export function GetPointOnBox(
  labelPosition: Position,
  box: Box,
  padding: number,
  width: number,
  height: number,
): Point {
  const p = box.TopLeft.Copy();
  const boxCenter = box.Center();

  switch (labelPosition) {
    case Position.OutsideTopLeft:
      p.X -= padding;
      p.Y -= padding + height;
      break;
    case Position.OutsideTopCenter:
      p.X = boxCenter.X - width / 2;
      p.Y -= padding + height;
      break;
    case Position.OutsideTopRight:
      p.X += box.Width - width - padding;
      p.Y -= padding + height;

      break;
    case Position.OutsideLeftTop:
      p.X -= padding + width;
      p.Y += padding;
      break;
    case Position.OutsideLeftMiddle:
      p.X -= padding + width;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.OutsideLeftBottom:
      p.X -= padding + width;
      p.Y += box.Height - height - padding;

      break;
    case Position.OutsideRightTop:
      p.X += box.Width + padding;
      p.Y += padding;
      break;
    case Position.OutsideRightMiddle:
      p.X += box.Width + padding;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.OutsideRightBottom:
      p.X += box.Width + padding;
      p.Y += box.Height - height - padding;

      break;
    case Position.OutsideBottomLeft:
      p.X += padding;
      p.Y += box.Height + padding;
      break;
    case Position.OutsideBottomCenter:
      p.X = boxCenter.X - width / 2;
      p.Y += box.Height + padding;
      break;
    case Position.OutsideBottomRight:
      p.X += box.Width - width - padding;
      p.Y += box.Height + padding;

      break;
    case Position.InsideTopLeft:
      p.X += padding;
      p.Y += padding;
      break;
    case Position.InsideTopCenter:
      p.X = boxCenter.X - width / 2;
      p.Y += padding;
      break;
    case Position.InsideTopRight:
      p.X += box.Width - width - padding;
      p.Y += padding;

      break;
    case Position.InsideMiddleLeft:
      p.X += padding;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.InsideMiddleCenter:
      p.X = boxCenter.X - width / 2;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.InsideMiddleRight:
      p.X += box.Width - width - padding;
      p.Y = boxCenter.Y - height / 2;

      break;
    case Position.InsideBottomLeft:
      p.X += padding;
      p.Y += box.Height - height - padding;
      break;
    case Position.InsideBottomCenter:
      p.X = boxCenter.X - width / 2;
      p.Y += box.Height - height - padding;
      break;
    case Position.InsideBottomRight:
      p.X += box.Width - width - padding;
      p.Y += box.Height - height - padding;

      break;
    case Position.BorderTopLeft:
      p.X += padding;
      p.Y -= height / 2;
      break;
    case Position.BorderTopCenter:
      p.X = boxCenter.X - width / 2;
      p.Y -= height / 2;
      break;
    case Position.BorderTopRight:
      p.X += box.Width - width - padding;
      p.Y -= height / 2;

      break;
    case Position.BorderLeftTop:
      p.X -= width / 2;
      p.Y += padding;
      break;
    case Position.BorderLeftMiddle:
      p.X -= width / 2;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.BorderLeftBottom:
      p.X -= width / 2;
      p.Y += box.Height - height - padding;

      break;
    case Position.BorderRightTop:
      p.X += box.Width - width / 2;
      p.Y += padding;
      break;
    case Position.BorderRightMiddle:
      p.X += box.Width - width / 2;
      p.Y = boxCenter.Y - height / 2;
      break;
    case Position.BorderRightBottom:
      p.X += box.Width - width / 2;
      p.Y += box.Height - height - padding;

      break;
    case Position.BorderBottomLeft:
      p.X += padding;
      p.Y += box.Height - height / 2;
      break;
    case Position.BorderBottomCenter:
      p.X = boxCenter.X - width / 2;
      p.Y += box.Height - height / 2;
      break;
    case Position.BorderBottomRight:
      p.X += box.Width - width - padding;
      p.Y += box.Height - height / 2;
  }

  return p;
}
export function GetPointOnRoute(
  labelPosition: Position,
  route: Route,
  strokeWidth: number,
  labelPercentage: number,
  width: number,
  height: number,
): [Point | null, number] {
  const totalLength = route.Length(),
    leftPosition = LEFT_LABEL_POSITION * totalLength,
    centerPosition = CENTER_LABEL_POSITION * totalLength,
    rightPosition = RIGHT_LABEL_POSITION * totalLength,
    unlockedPosition = labelPercentage * totalLength;
  const getOffsetLabelPosition = (
    base: Point,
    start: Point,
    end: Point,
    flip: boolean,
  ) => {
    let [normalX, normalY] = GetUnitNormalVector(
      start.X,
      start.Y,
      end.X,
      end.Y,
    );
    if (flip) {
      normalX *= -1;
      normalY *= -1;
    }
    const offsetX = strokeWidth / 2 + PADDING + width / 2,
      offsetY = strokeWidth / 2 + PADDING + height / 2;
    return new Point(base.X + normalX * offsetX, base.Y + normalY * offsetY);
  };
  let labelCenter: Point,
    index = 0;
  switch (labelPosition) {
    case Position.InsideMiddleLeft:
      [labelCenter, index] = route.GetPointAtDistance(leftPosition);
      break;
    case Position.InsideMiddleCenter:
      [labelCenter, index] = route.GetPointAtDistance(centerPosition);
      break;
    case Position.InsideMiddleRight:
      [labelCenter, index] = route.GetPointAtDistance(rightPosition);
      break;
    case Position.UnlockedMiddle:
      [labelCenter, index] = route.GetPointAtDistance(unlockedPosition);
      break;
    default: {
      let distance: number, flip: boolean;
      switch (labelPosition) {
        case Position.OutsideTopLeft:
          distance = leftPosition;
          flip = true;
          break;
        case Position.OutsideTopCenter:
          distance = centerPosition;
          flip = true;
          break;
        case Position.OutsideTopRight:
          distance = rightPosition;
          flip = true;
          break;
        case Position.OutsideBottomLeft:
          distance = leftPosition;
          flip = false;
          break;
        case Position.OutsideBottomCenter:
          distance = centerPosition;
          flip = false;
          break;
        case Position.OutsideBottomRight:
          distance = rightPosition;
          flip = false;
          break;
        case Position.UnlockedTop:
          distance = unlockedPosition;
          flip = true;
          break;
        case Position.UnlockedBottom:
          distance = unlockedPosition;
          flip = false;
          break;
        default:
          return [null, -1];
      }
      // Go's short declaration shadows the named result index in these cases.
      const [base, segmentIndex] = route.GetPointAtDistance(distance);
      labelCenter = getOffsetLabelPosition(
        base,
        route.points[segmentIndex]!,
        route.points[segmentIndex + 1]!,
        flip,
      );
    }
  }
  labelCenter.X = chopPrecision(labelCenter.X - width / 2);
  labelCenter.Y = chopPrecision(labelCenter.Y - height / 2);
  return [labelCenter, index];
}
function chopPrecision(f: number): number {
  const result = Round(Math.fround(f * 10000) / 10000);
  return result === 0 ? 0 : result;
}
