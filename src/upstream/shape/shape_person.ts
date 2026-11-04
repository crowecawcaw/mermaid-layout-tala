// Translated from lib/shape/shape_person.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const PERSON_AR_LIMIT = 1.5;
const personShoulderWidthFactor = 20.2 / 68.3;
function personPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, box.Width / 68.3, box.Height / 77.4);

  pc.StartAt(pc.Absolute(68.3, 77.4));
  pc.H(false, 0);
  pc.V(true, -1.1);
  pc.C(true, 0, -13.2, 7.5, -25.1, 19.3, -30.8);
  pc.C(false, 12.8, 40.9, 8.9, 33.4, 8.9, 25.2);
  pc.C(false, 8.9, 11.3, 20.2, 0, 34.1, 0);

  pc.C(true, 13.9, 0, 25.2, 11.3, 25.2, 25.2);

  pc.C(true, 0, 8.2, -3.8, 15.6, -10.4, 20.4);
  pc.C(true, 11.8, 5.7, 19.3, 17.6, 19.3, 30.8);
  pc.V(true, 1);
  pc.H(false, 68.3);
  pc.Z();
  return pc;
}
export class ShapePerson extends BaseShape {
  constructor(box: Box) {
    super('Person', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let tl = this.Box.TopLeft.Copy();
    let shoulderWidth = personShoulderWidthFactor * width;
    tl.X += shoulderWidth;
    width -= shoulderWidth * 2;
    return new Box(tl, width, this.Box.Height);
  }
  Perimeter(): Intersectable[] {
    return personPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [personPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(personPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let totalWidth = width + paddingX;

    let shoulderWidth =
      (totalWidth * personShoulderWidthFactor) /
      (1 - 2 * personShoulderWidthFactor);
    totalWidth += 2 * shoulderWidth;
    let totalHeight = height + paddingY;

    [totalWidth, totalHeight] = LimitAR(
      totalWidth,
      totalHeight,
      PERSON_AR_LIMIT,
    );
    return [Math.ceil(totalWidth), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [10, defaultPadding];
  }
}
