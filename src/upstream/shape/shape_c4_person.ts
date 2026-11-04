// Translated from lib/shape/shape_c4_person.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const C4_PERSON_AR_LIMIT = 1.5;
const HEAD_RADIUS_FACTOR = 0.22;
const BODY_TOP_FACTOR = 0.8;
const CORNER_RADIUS_FACTOR = 0.175;
function bodyPath(box: Box): SvgPathContext {
  let width = box.Width;
  let height = box.Height;

  let pc = new SvgPathContext(box.TopLeft, 1, 1);

  let headRadius = width * HEAD_RADIUS_FACTOR;
  let headCenterY = headRadius;
  let bodyTop = headCenterY + headRadius * BODY_TOP_FACTOR;
  let bodyWidth = width;
  let bodyHeight = height - bodyTop;
  let bodyLeft = 0;

  let cornerRadius = Math.min(width * CORNER_RADIUS_FACTOR, bodyHeight * 0.25);

  pc.StartAt(pc.Absolute(bodyLeft, bodyTop + cornerRadius));

  pc.C(
    true,
    0,
    ((-4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    ((4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    -cornerRadius,
    cornerRadius,
    -cornerRadius,
  );
  pc.H(true, bodyWidth - 2 * cornerRadius);
  pc.C(
    true,
    ((4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    0,
    cornerRadius,
    ((4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    cornerRadius,
    cornerRadius,
  );
  pc.V(true, bodyHeight - 2 * cornerRadius);
  pc.C(
    true,
    0,
    ((4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    ((-4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    cornerRadius,
    -cornerRadius,
    cornerRadius,
  );
  pc.H(true, -(bodyWidth - 2 * cornerRadius));
  pc.C(
    true,
    ((-4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    0,
    -cornerRadius,
    ((-4 * (Math.sqrt(2) - 1)) / 3) * cornerRadius,
    -cornerRadius,
    -cornerRadius,
  );
  pc.Z();

  return pc;
}
function headPath(box: Box): SvgPathContext {
  let width = box.Width;

  let pc = new SvgPathContext(box.TopLeft, 1, 1);

  let headRadius = width * HEAD_RADIUS_FACTOR;
  let headCenterX = width / 2;
  let headCenterY = headRadius;

  pc.StartAt(pc.Absolute(headCenterX, headCenterY - headRadius));

  pc.C(
    false,
    headCenterX + (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterY - headRadius,
    headCenterX + headRadius,
    headCenterY - (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterX + headRadius,
    headCenterY,
  );

  pc.C(
    false,
    headCenterX + headRadius,
    headCenterY + (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterX + (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterY + headRadius,
    headCenterX,
    headCenterY + headRadius,
  );

  pc.C(
    false,
    headCenterX - (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterY + headRadius,
    headCenterX - headRadius,
    headCenterY + (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterX - headRadius,
    headCenterY,
  );

  pc.C(
    false,
    headCenterX - headRadius,
    headCenterY - (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterX - (headRadius * 4 * (Math.sqrt(2) - 1)) / 3,
    headCenterY - headRadius,
    headCenterX,
    headCenterY - headRadius,
  );

  return pc;
}
export class ShapeC4Person extends BaseShape {
  constructor(box: Box) {
    super('C4Person', box);
  }
  GetInnerBox(): Box {
    let width = this.Box.Width;
    let height = this.Box.Height;

    let headRadius = width * HEAD_RADIUS_FACTOR;
    let headCenterY = headRadius;
    let bodyTop = headCenterY + headRadius * BODY_TOP_FACTOR;

    let horizontalPadding = width * 0.05;

    let verticalPadding = height * 0.03;

    let tl = this.Box.TopLeft.Copy();
    tl.X += horizontalPadding;
    tl.Y += bodyTop + verticalPadding;

    let innerWidth = width - horizontalPadding * 2;
    let innerHeight = height - bodyTop - verticalPadding * 2;

    return new Box(tl, innerWidth, innerHeight);
  }
  Perimeter(): Intersectable[] {
    let width = this.Box.Width;

    let bodyPerimeter = bodyPath(this.Box).Path;

    let headRadius = width * HEAD_RADIUS_FACTOR;
    let headCenterX = this.Box.TopLeft.X + width / 2;
    let headCenterY = this.Box.TopLeft.Y + headRadius;
    let headCenter = new Point(headCenterX, headCenterY);

    let headEllipse = new Ellipse(headCenter, headRadius, headRadius);

    return [...bodyPerimeter, headEllipse];
  }
  GetSVGPathData(): string[] {
    return [bodyPath(this.Box).PathData(), headPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(bodyPath(this.Box), headPath(this.Box));
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    let contentWidth = width + paddingX;
    let contentHeight = height + paddingY;

    let totalWidth = contentWidth / 0.9;
    let headRadius = totalWidth * HEAD_RADIUS_FACTOR;

    let headCenterY = headRadius;
    let bodyTop = headCenterY + headRadius * BODY_TOP_FACTOR;

    let verticalPadding = totalWidth * 0.06;
    let totalHeight = contentHeight + bodyTop + verticalPadding;

    let minHeight = totalWidth * 0.95;
    if (totalHeight < minHeight) {
      totalHeight = minHeight;
    }

    [totalWidth, totalHeight] = LimitAR(
      totalWidth,
      totalHeight,
      C4_PERSON_AR_LIMIT,
    );
    return [Math.ceil(totalWidth), Math.ceil(totalHeight)];
  }
  GetDefaultPadding(): [number, number] {
    return [10, defaultPadding];
  }
}
