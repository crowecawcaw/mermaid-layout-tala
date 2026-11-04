// Translated from lib/shape/shape_document.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const docPathHeight = 18.925;
const docPathInnerBottom = 14;
const docPathBottom = 16.3;
function documentPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, box.Width, box.Height);
  pc.StartAt(pc.Absolute(0, docPathBottom / docPathHeight));
  pc.L(false, 0, 0);
  pc.L(false, 1, 0);
  pc.L(false, 1, docPathBottom / docPathHeight);
  pc.C(
    false,
    5 / 6.0,
    12.8 / docPathHeight,
    2 / 3.0,
    12.8 / docPathHeight,
    1 / 2.0,
    docPathBottom / docPathHeight,
  );
  pc.C(
    false,
    1 / 3.0,
    19.8 / docPathHeight,
    1 / 6.0,
    19.8 / docPathHeight,
    0,
    docPathBottom / docPathHeight,
  );
  pc.Z();
  return pc;
}
export class ShapeDocument extends BaseShape {
  constructor(box: Box) {
    super('Document', box);
  }
  GetInnerBox(): Box {
    let height = (this.Box.Height * docPathInnerBottom) / docPathHeight;
    return new Box(this.Box.TopLeft.Copy(), this.Box.Width, height);
  }
  Perimeter(): Intersectable[] {
    return documentPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [documentPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(documentPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let baseHeight = ((height + paddingY) * docPathHeight) / docPathInnerBottom;
    return [Math.ceil(width + paddingX), Math.ceil(baseHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [
      defaultPadding,
      (defaultPadding * docPathInnerBottom) / docPathHeight,
    ];
  }
}
