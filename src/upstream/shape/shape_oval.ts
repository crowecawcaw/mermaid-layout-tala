// Translated from lib/shape/shape_oval.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const OVAL_AR_LIMIT = 3;
export class ShapeOval extends BaseShape {
  constructor(box: Box) {
    super('Oval', box);
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
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let theta = Math.fround(Math.atan2(height, width));

    let paddedWidth = width + paddingX * Math.cos(theta);
    let paddedHeight = height + paddingY * Math.sin(theta);

    let [totalWidth, totalHeight] = [
      Math.ceil(Math.SQRT2 * paddedWidth),
      Math.ceil(Math.SQRT2 * paddedHeight),
    ];

    [totalWidth, totalHeight] = LimitAR(totalWidth, totalHeight, OVAL_AR_LIMIT);
    return [totalWidth, totalHeight];
  }
  GetInsidePlacement(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): Point {
    let rx = this.Box.Width / 2;
    let ry = this.Box.Height / 2;
    let theta = Math.fround(Math.atan2(ry, rx));
    let sin = Math.sin(theta);
    let cos = Math.cos(theta);

    let r =
      (rx * ry) / Math.sqrt(Math.pow(rx * sin, 2) + Math.pow(ry * cos, 2));

    return new Point(
      this.Box.TopLeft.X + Math.ceil(rx - cos * (r - paddingX / 2)),
      this.Box.TopLeft.Y + Math.ceil(ry - sin * (r - paddingY / 2)),
    );
  }
  Perimeter(): Intersectable[] {
    return [
      new Ellipse(this.Box.Center(), this.Box.Width / 2, this.Box.Height / 2),
    ];
  }
}
