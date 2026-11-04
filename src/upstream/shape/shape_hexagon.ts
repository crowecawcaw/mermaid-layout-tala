// Translated from lib/shape/shape_hexagon.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
function hexagonPath(box: Box): SvgPathContext {
  let halfYFactor = 43.6 / 87.3;
  let pc = new SvgPathContext(box.TopLeft, box.Width, box.Height);
  pc.StartAt(pc.Absolute(0.25, 0));
  pc.L(false, 0, halfYFactor);
  pc.L(false, 0.25, 1);
  pc.L(false, 0.75, 1);
  pc.L(false, 1, halfYFactor);
  pc.L(false, 0.75, 0);
  pc.Z();
  return pc;
}
export class ShapeHexagon extends BaseShape {
  constructor(box: Box) {
    super('Hexagon', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let height = this.Box.Height;
    let tl = this.Box.TopLeft.Copy();
    tl.X += width / 6;
    width /= 1.5;
    tl.Y += height / 6;
    height /= 1.5;
    return new Box(tl, width, height);
  }
  Perimeter(): Intersectable[] {
    return hexagonPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [hexagonPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(hexagonPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = 1.5 * (width + paddingX);
    let totalHeight = 1.5 * (height + paddingY);
    return [Math.ceil(totalWidth), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding / 2, defaultPadding / 2];
  }
}
