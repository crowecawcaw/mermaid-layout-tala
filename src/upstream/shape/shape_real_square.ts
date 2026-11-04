// Translated from lib/shape/shape_real_square.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
export class ShapeRealSquare extends BaseShape {
  constructor(box: Box) {
    super('RealSquare', box);
  }
  AspectRatio1(): boolean {
    return true;
  }
  IsRectangular(): boolean {
    return true;
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let sideLength = Math.ceil(Math.max(width + paddingX, height + paddingY));
    return [sideLength, sideLength];
  }
}
