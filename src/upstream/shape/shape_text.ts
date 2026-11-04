import { ShapeSquare } from './shape_square.js';
// Translated from lib/shape/shape_text.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
export class ShapeText extends ShapeSquare {
  constructor(box: Box) {
    super(box);
    this.Type = 'Text';
  }
  GetDefaultPadding(): [number, number] {
    return [0, 0];
  }
}
