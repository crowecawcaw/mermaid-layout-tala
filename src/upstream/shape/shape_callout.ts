// Translated from lib/shape/shape_callout.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const defaultTipWidth = 30;
const defaultTipHeight = 45;
function getTipWidth(box: Box): number {
  let tipWidth = defaultTipWidth;
  if (box.Width < tipWidth * 2) {
    tipWidth = box.Width / 2.0;
  }
  return tipWidth;
}
function getTipHeight(box: Box): number {
  let tipHeight = defaultTipHeight;
  if (box.Height < tipHeight * 2) {
    tipHeight = box.Height / 2.0;
  }
  return tipHeight;
}
function calloutPath(box: Box): SvgPathContext {
  let tipWidth = getTipWidth(box);
  let tipHeight = getTipHeight(box);
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0, 0));
  pc.V(true, box.Height - tipHeight);
  pc.H(true, box.Width / 2.0);
  pc.V(true, tipHeight);
  pc.L(true, tipWidth, -tipHeight);
  pc.H(true, box.Width / 2.0 - tipWidth);
  pc.V(true, -(box.Height - tipHeight));
  pc.H(true, -box.Width);
  pc.Z();
  return pc;
}
export class ShapeCallout extends BaseShape {
  constructor(box: Box) {
    super('Callout', box);
  }
  GetInnerBox(): Box {
    let tipHeight = getTipHeight(this.Box);
    let height = this.Box.Height - tipHeight;
    return new Box(this.Box.TopLeft.Copy(), this.Box.Width, height);
  }
  Perimeter(): Intersectable[] {
    return calloutPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [calloutPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(calloutPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let baseHeight = height + paddingY;
    if (baseHeight < defaultTipHeight) {
      baseHeight *= 2;
    } else {
      baseHeight += defaultTipHeight;
    }
    return [Math.ceil(width + paddingX), Math.ceil(baseHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, defaultPadding / 2];
  }
}
