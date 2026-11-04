// Translated from lib/shape/shape_page.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const pageCornerWidth = 20.8164;
const pageCornerHeight = 20.348;
function pageOuterPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(0.5, 0));
  pc.H(false, box.Width - 20.8164);
  pc.C(
    false,
    box.Width - 19.6456,
    0.0,
    box.Width - 18.521,
    0.456297,
    box.Width - 17.6811,
    1.27202,
  );
  pc.L(false, box.Width - 1.3647, 17.12);
  pc.C(
    false,
    box.Width - 0.4923,
    17.9674,
    box.Width,
    19.1318,
    box.Width,
    20.348,
  );
  pc.V(false, box.Height - 0.5);
  pc.C(
    false,
    box.Width,
    box.Height - 0.2239,
    box.Width - 0.2239,
    box.Height,
    box.Width - 0.5,
    box.Height,
  );

  pc.H(false, 0.499999);
  pc.C(
    false,
    0.223857,
    box.Height,
    0,
    box.Height - 0.2239,
    0,
    box.Height - 0.5,
  );
  pc.V(false, 0.499999);
  pc.C(false, 0, 0.223857, 0.223857, 0, 0.5, 0);
  pc.Z();
  return pc;
}
function pageInnerPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, 1, 1);
  pc.StartAt(pc.Absolute(box.Width - 1.08197, box.Height));
  pc.H(false, 1.08196);
  pc.C(true, -0.64918, 0, -1.08196, -0.43287, -1.08196, -1.08219);
  pc.V(false, 1.08219);
  pc.C(true, 0, -0.64931, 0.43278, -1.08219, 1.08196, -1.08219);

  pc.H(true, box.Width - 22.72132);
  pc.C(true, 0.64918, 0, 1.08196, 0.43287, 1.08196, 1.08219);
  pc.V(true, 17.09863);
  pc.C(true, 0, 1.29863, 0.86557, 2.38082, 2.38032, 2.38082);
  pc.H(false, box.Width - 1.08197);
  pc.C(true, 0.64918, 0, 1.08196, 0.43287, 1.08196, 1.08196);
  pc.V(false, box.Height - 1.0822);
  pc.C(
    false,
    box.Width - 1.0,
    box.Height - 0.43288,
    box.Width - 0.43279,
    box.Height,
    box.Width - 1.08197,
    box.Height,
  );
  pc.Z();
  return pc;
}
export class ShapePage extends BaseShape {
  constructor(box: Box) {
    super('Page', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;

    if (this.Box.Height < 3 * pageCornerHeight) {
      width -= pageCornerWidth;
    }
    return new Box(this.Box.TopLeft.Copy(), width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return pageOuterPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [
      pageOuterPath(this.Box).PathData(),
      pageInnerPath(this.Box).PathData(),
    ];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(pageOuterPath(this.Box), pageInnerPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = width + paddingX;
    let totalHeight = height + paddingY;

    if (totalHeight < 3 * pageCornerHeight) {
      totalWidth += pageCornerWidth;
    }
    totalWidth = Math.max(totalWidth, 2 * pageCornerWidth);
    totalHeight = Math.max(totalHeight, pageCornerHeight);
    return [Math.ceil(totalWidth), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, pageCornerHeight + defaultPadding];
  }
}
