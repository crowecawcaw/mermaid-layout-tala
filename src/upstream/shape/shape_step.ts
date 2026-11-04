// Translated from lib/shape/shape_step.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const STEP_WEDGE_WIDTH = 35.0;
function stepPath(box: Box): SvgPathContext {
  let wedgeWidth = STEP_WEDGE_WIDTH;
  if (box.Width <= wedgeWidth) {
    wedgeWidth = box.Width / 2.0;
  }
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0, 0));
  pc.L(false, box.Width - wedgeWidth, 0);
  pc.L(false, box.Width, box.Height / 2);
  pc.L(false, box.Width - wedgeWidth, box.Height);
  pc.L(false, 0, box.Height);
  pc.L(false, wedgeWidth, box.Height / 2);
  pc.Z();
  return pc;
}
export class ShapeStep extends BaseShape {
  constructor(box: Box) {
    super('Step', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let tl = this.Box.TopLeft.Copy();
    width -= 2 * STEP_WEDGE_WIDTH;
    tl.X += STEP_WEDGE_WIDTH;
    return new Box(tl, width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return stepPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [stepPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(stepPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = width + paddingX + 2 * STEP_WEDGE_WIDTH;
    return [Math.ceil(totalWidth), Math.ceil(height + paddingY)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding / 4, defaultPadding + STEP_WEDGE_WIDTH];
  }
}
