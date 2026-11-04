// Translated internal/labelgeom/arrowhead.go and its d2target geometry dependency
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Route } from '../geo/route.js';
import { GetUnitNormalVector } from '../geo/vector.js';
import { Position, GetPointOnRoute, PADDING } from '../label/label.js';
export function ArrowheadDimensions(
  arrowhead: string,
  strokeWidth: number,
): [number, number] {
  let baseWidth = 0,
    baseHeight = 0,
    widthMultiplier = 0,
    heightMultiplier = 0;
  switch (arrowhead) {
    case 'arrow':
      baseWidth = 4;
      baseHeight = 4;
      widthMultiplier = 4;
      heightMultiplier = 4;
      break;
    case 'triangle':
      baseWidth = 4;
      baseHeight = 4;
      widthMultiplier = 3;
      heightMultiplier = 4;
      break;
    case 'unfilled-triangle':
      baseWidth = 7;
      baseHeight = 7;
      widthMultiplier = 3;
      heightMultiplier = 4;
      break;
    case 'line':
      widthMultiplier = 5;
      heightMultiplier = 8;
      break;
    case 'filled-diamond':
      baseWidth = 11;
      baseHeight = 7;
      widthMultiplier = 5.5;
      heightMultiplier = 3.5;
      break;
    case 'diamond':
      baseWidth = 11;
      baseHeight = 9;
      widthMultiplier = 5.5;
      heightMultiplier = 4.5;
      break;
    case 'cross':
      baseWidth = 7;
      baseHeight = 7;
      widthMultiplier = 5;
      heightMultiplier = 5;
      break;
    case 'filled-circle':
    case 'circle':
      baseWidth = 8;
      baseHeight = 8;
      widthMultiplier = 5;
      heightMultiplier = 5;
      break;
    case 'filled-box':
    case 'box':
      baseWidth = 6;
      baseHeight = 6;
      widthMultiplier = 5;
      heightMultiplier = 5;
      break;
    case 'cf-one':
    case 'cf-many':
    case 'cf-one-required':
    case 'cf-many-required':
      baseWidth = 9;
      baseHeight = 9;
      widthMultiplier = 4.5;
      heightMultiplier = 4.5;
      break;
  }
  const clipped = 2 > strokeWidth ? 2 : strokeWidth;
  return [
    baseWidth + clipped * widthMultiplier,
    baseHeight + clipped * heightMultiplier,
  ];
}
export function ArrowheadTopLeft(
  points: Point[],
  isTarget: boolean,
  sourceArrowhead: string,
  targetArrowhead: string,
  width: number,
  height: number,
): Point {
  width = Math.trunc(width);
  height = Math.trunc(height);
  const index = isTarget ? points.length - 2 : 0,
    start = points[index]!,
    end = points[index + 1]!;
  const [normalX, normalY] = GetUnitNormalVector(
    end.X,
    end.Y,
    start.X,
    start.Y,
  );
  const shift =
      Math.abs(normalX) * (height / 2 + PADDING) +
      Math.abs(normalY) * (width / 2 + PADDING),
    route = new Route(points),
    length = route.Length();
  let position = isTarget ? 1 : 0;
  if (length > 0)
    position = isTarget ? position - shift / length : shift / length;
  const strokeWidth = 2,
    [labelTL] = GetPointOnRoute(
      Position.UnlockedTop,
      route,
      strokeWidth,
      position,
      width,
      height,
    );
  let arrowSize = 0;
  if (isTarget && targetArrowhead !== 'none')
    [, arrowSize] = ArrowheadDimensions(targetArrowhead, strokeWidth);
  else if (sourceArrowhead !== 'none')
    [, arrowSize] = ArrowheadDimensions(sourceArrowhead, strokeWidth);
  if (arrowSize > 0) {
    const offset = arrowSize / 2 + 2 - strokeWidth / 2 - PADDING;
    if (offset > 0) {
      labelTL!.X += normalX * offset;
      labelTL!.Y += normalY * offset;
    }
  }
  return labelTL!;
}
