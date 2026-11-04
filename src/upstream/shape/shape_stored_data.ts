// Translated from lib/shape/shape_stored_data.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const storedDataWedgeWidth = 15;
function storedDataPath(box: Box): SvgPathContext {
  let wedgeWidth = storedDataWedgeWidth;
  let multiplier = 0.27;
  if (box.Width < wedgeWidth * 2) {
    wedgeWidth = box.Width / 2.0;
  }
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(wedgeWidth, 0));
  pc.H(true, box.Width - wedgeWidth);
  pc.C(
    false,
    box.Width - wedgeWidth * multiplier,
    0,
    box.Width - wedgeWidth,
    box.Height * multiplier,
    box.Width - wedgeWidth,
    box.Height / 2.0,
  );
  pc.C(
    false,
    box.Width - wedgeWidth,
    box.Height - box.Height * multiplier,
    box.Width - wedgeWidth * multiplier,
    box.Height,
    box.Width,
    box.Height,
  );
  pc.H(true, -(box.Width - wedgeWidth));
  pc.C(
    false,
    wedgeWidth - wedgeWidth * multiplier,
    box.Height,
    0,
    box.Height - box.Height * multiplier,
    0,
    box.Height / 2.0,
  );
  pc.C(
    false,
    0,
    box.Height * multiplier,
    wedgeWidth - wedgeWidth * multiplier,
    0,
    wedgeWidth,
    0,
  );
  pc.Z();
  return pc;
}
export class ShapeStoredData extends BaseShape {
  constructor(box: Box) {
    super('StoredData', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let tl = this.Box.TopLeft.Copy();
    width -= 2 * storedDataWedgeWidth;
    tl.X += storedDataWedgeWidth;
    return new Box(tl, width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return storedDataPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [storedDataPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(storedDataPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = width + paddingX + 2 * storedDataWedgeWidth;
    return [Math.ceil(totalWidth), Math.ceil(height + paddingY)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding - 10, defaultPadding];
  }
}
