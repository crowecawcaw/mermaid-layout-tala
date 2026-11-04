// Translated from lib/shape/shape_circle.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
export class ShapeCircle extends BaseShape {
  constructor(box: Box) {
    super('Circle', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let height = this.Box.Height;
    let insideTL = this.GetInsidePlacement(width, height, 0, 0);
    let tl = this.Box.TopLeft.Copy();
    width -= 2 * (insideTL.X - tl.X);
    height -= 2 * (insideTL.Y - tl.Y);
    return new Box(insideTL, width, height);
  }
  AspectRatio1(): boolean {
    return true;
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let length = Math.max(width + paddingX, height + paddingY);
    let diameter = Math.ceil(Math.SQRT2 * length);
    return [diameter, diameter];
  }
  GetInsidePlacement(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): Point {
    let r = this.GetBox().Width / 2;
    let halfLength = (r * Math.SQRT2) / 2;
    let p = new Point(
      this.GetBox().TopLeft.X + Math.ceil(r - halfLength + paddingX / 2),
      this.GetBox().TopLeft.Y + Math.ceil(r - halfLength + paddingY / 2),
    );
    return p;
  }
  Perimeter(): Intersectable[] {
    return [
      new Ellipse(this.Box.Center(), this.Box.Width / 2, this.Box.Height / 2),
    ];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding / Math.SQRT2, defaultPadding / Math.SQRT2];
  }
}
