// Translated from lib/shape/shape_diamond.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
function diamondPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, box.Width / 77, box.Height / 76.9);
  pc.StartAt(pc.Absolute(38.5, 76.9));
  pc.C(true, -0.3, 0, -0.5, -0.1, -0.7, -0.3);
  pc.L(false, 0.3, 39.2);
  pc.C(true, -0.4, -0.4, -0.4, -1, 0, -1.4);
  pc.L(false, 37.8, 0.3);
  pc.C(true, 0.4, -0.4, 1, -0.4, 1.4, 0);
  pc.L(true, 37.5, 37.5);
  pc.C(true, 0.4, 0.4, 0.4, 1, 0, 1.4);
  pc.L(false, 39.2, 76.6);
  pc.C(false, 39, 76.8, 38.8, 76.9, 38.5, 76.9);
  pc.Z();
  return pc;
}
export class ShapeDiamond extends BaseShape {
  constructor(box: Box) {
    super('Diamond', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let height = this.Box.Height;
    let tl = this.Box.TopLeft.Copy();
    tl.X += width / 4;
    tl.Y += height / 4;
    width /= 2;
    height /= 2;
    return new Box(tl, width, height);
  }
  Perimeter(): Intersectable[] {
    return diamondPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [diamondPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(diamondPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = 2 * (width + paddingX);
    let totalHeight = 2 * (height + paddingY);
    return [Math.ceil(totalWidth), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding / 4, defaultPadding / 2];
  }
}
