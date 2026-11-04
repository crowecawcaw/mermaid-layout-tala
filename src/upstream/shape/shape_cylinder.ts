// Translated from lib/shape/shape_cylinder.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
export const defaultArcDepth = 24;
function getArcHeight(box: Box): number {
  let arcHeight = defaultArcDepth;

  if (box.Height < arcHeight * 2) {
    arcHeight = box.Height / 2.0;
  }
  return arcHeight;
}
function cylinderOuterPath(box: Box): SvgPathContext {
  let arcHeight = getArcHeight(box);
  let multiplier = 0.45;
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0, arcHeight));
  pc.C(false, 0, 0, box.Width * multiplier, 0, box.Width / 2, 0);
  pc.C(
    false,
    box.Width - box.Width * multiplier,
    0,
    box.Width,
    0,
    box.Width,
    arcHeight,
  );
  pc.V(true, box.Height - arcHeight * 2);
  pc.C(
    false,
    box.Width,
    box.Height,
    box.Width - box.Width * multiplier,
    box.Height,
    box.Width / 2,
    box.Height,
  );
  pc.C(
    false,
    box.Width * multiplier,
    box.Height,
    0,
    box.Height,
    0,
    box.Height - arcHeight,
  );
  pc.V(true, -(box.Height - arcHeight * 2));
  pc.Z();
  return pc;
}
function cylinderInnerPath(box: Box): SvgPathContext {
  let arcHeight = getArcHeight(box);
  let multiplier = 0.45;
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0, arcHeight));
  pc.C(
    false,
    0,
    arcHeight * 2,
    box.Width * multiplier,
    arcHeight * 2,
    box.Width / 2,
    arcHeight * 2,
  );
  pc.C(
    false,
    box.Width - box.Width * multiplier,
    arcHeight * 2,
    box.Width,
    arcHeight * 2,
    box.Width,
    arcHeight,
  );
  return pc;
}
export class ShapeCylinder extends BaseShape {
  constructor(box: Box) {
    super('Cylinder', box);
  }
  GetInnerBox(): Box {
    let height = this.Box.Height;
    let tl = this.Box.TopLeft.Copy();
    let arc = getArcHeight(this.Box);
    height -= 3 * arc;
    tl.Y += 2 * arc;
    return new Box(tl, this.Box.Width, height);
  }
  Perimeter(): Intersectable[] {
    return cylinderOuterPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [
      cylinderOuterPath(this.Box).PathData(),
      cylinderInnerPath(this.Box).PathData(),
    ];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(
      cylinderOuterPath(this.Box),
      cylinderInnerPath(this.Box),
    );
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalHeight = height + paddingY + 3 * defaultArcDepth;
    return [Math.ceil(width + paddingX), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, defaultPadding / 2];
  }
}
