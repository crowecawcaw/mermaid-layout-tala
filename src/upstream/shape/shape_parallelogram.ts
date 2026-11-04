// Translated from lib/shape/shape_parallelogram.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const parallelWedgeWidth = 26;
function parallelogramPath(box: Box): SvgPathContext {
  let wedgeWidth = parallelWedgeWidth;

  if (box.Width <= wedgeWidth) {
    wedgeWidth = box.Width / 2.0;
  }
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(wedgeWidth, 0));
  pc.L(false, box.Width, 0);
  pc.L(false, box.Width - wedgeWidth, box.Height);
  pc.L(false, 0, box.Height);
  pc.L(false, 0, box.Height);
  pc.Z();
  return pc;
}
export class ShapeParallelogram extends BaseShape {
  constructor(box: Box) {
    super('Parallelogram', box);
  }
  GetInnerBox(): Box {
    let tl = this.Box.TopLeft.Copy();
    let width = this.Box.Width - 2 * parallelWedgeWidth;
    tl.X += parallelWedgeWidth;
    return new Box(tl, width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return parallelogramPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [parallelogramPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(parallelogramPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = width + paddingX + parallelWedgeWidth * 2;
    return [Math.ceil(totalWidth), Math.ceil(height + paddingY)];
  }
}
