// Translated from lib/shape/shape_package.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const packageTopMinHeight = 34;
const packageTopMaxHeight = 55;
const packageTopMinWidth = 50;
const packageTopMaxWidth = 150;
const packageHorizontalScalar = 0.5;
const packageVerticalScalar = 0.2;
function getTopDimensions(box: Box): [number, number] {
  let width = 0,
    height = 0;
  width = box.Width * packageHorizontalScalar;
  if (box.Width >= 2 * packageTopMinWidth) {
    width = Math.min(packageTopMaxWidth, Math.max(packageTopMinWidth, width));
  }
  height = Math.min(packageTopMaxHeight, box.Height * packageVerticalScalar);
  return [width, height];
}
function packagePath(box: Box): SvgPathContext {
  let [topWidth, topHeight] = getTopDimensions(box);

  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0, 0));
  pc.L(false, topWidth, 0);
  pc.L(false, topWidth, topHeight);
  pc.L(false, box.Width, topHeight);
  pc.L(false, box.Width, box.Height);
  pc.L(false, 0, box.Height);
  pc.Z();
  return pc;
}
export class ShapePackage extends BaseShape {
  constructor(box: Box) {
    super('Package', box);
  }
  GetInnerBox(): Box {
    let tl = this.Box.TopLeft.Copy();
    let height = this.Box.Height;

    let [_, topHeight] = getTopDimensions(this.Box);
    tl.Y += topHeight;
    height -= topHeight;
    return new Box(tl, this.Box.Width, height);
  }
  Perimeter(): Intersectable[] {
    return packagePath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [packagePath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(packagePath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let innerHeight = height + paddingY;

    let topHeight =
      (innerHeight * packageVerticalScalar) / (1 - packageVerticalScalar);
    let totalHeight = innerHeight + Math.min(topHeight, packageTopMaxHeight);

    return [Math.ceil(width + paddingX), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, 0.8 * defaultPadding];
  }
}
