import { defaultArcDepth } from './shape_cylinder.js';
// Translated from lib/shape/shape_queue.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
function getArcWidth(box: Box): number {
  let arcWidth = defaultArcDepth;

  if (box.Width < arcWidth * 2) {
    arcWidth = box.Width / 2.0;
  }
  return arcWidth;
}
function queueOuterPath(box: Box): SvgPathContext {
  let arcWidth = getArcWidth(box);
  let multiplier = 0.45;
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(arcWidth, 0));
  pc.H(true, box.Width - 2 * arcWidth);
  pc.C(
    false,
    box.Width,
    0,
    box.Width,
    box.Height * multiplier,
    box.Width,
    box.Height / 2.0,
  );
  pc.C(
    false,
    box.Width,
    box.Height - box.Height * multiplier,
    box.Width,
    box.Height,
    box.Width - arcWidth,
    box.Height,
  );
  pc.H(true, -1 * (box.Width - 2 * arcWidth));
  pc.C(
    false,
    0,
    box.Height,
    0,
    box.Height - box.Height * multiplier,
    0,
    box.Height / 2.0,
  );
  pc.C(false, 0, box.Height * multiplier, 0, 0, arcWidth, 0);
  pc.Z();
  return pc;
}
function queueInnerPath(box: Box): SvgPathContext {
  let arcWidth = getArcWidth(box);
  let multiplier = 0.45;
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(box.Width - arcWidth, 0));
  pc.C(
    false,
    box.Width - 2 * arcWidth,
    0,
    box.Width - 2 * arcWidth,
    box.Height * multiplier,
    box.Width - 2 * arcWidth,
    box.Height / 2.0,
  );
  pc.C(
    false,
    box.Width - 2 * arcWidth,
    box.Height - box.Height * multiplier,
    box.Width - 2 * arcWidth,
    box.Height,
    box.Width - arcWidth,
    box.Height,
  );
  return pc;
}
export class ShapeQueue extends BaseShape {
  constructor(box: Box) {
    super('Queue', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let tl = this.Box.TopLeft.Copy();
    let arcWidth = getArcWidth(this.Box);
    width -= 3 * arcWidth;
    tl.X += arcWidth;
    return new Box(tl, width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return queueOuterPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [
      queueOuterPath(this.Box).PathData(),
      queueInnerPath(this.Box).PathData(),
    ];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(queueOuterPath(this.Box), queueInnerPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = 3 * defaultArcDepth + width + paddingX;
    return [Math.ceil(totalWidth), Math.ceil(height + paddingY)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding / 2, defaultPadding];
  }
}
