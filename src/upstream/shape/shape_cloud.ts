// Translated from lib/shape/shape_cloud.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { BaseShape, defaultPadding, LimitAR, pathCommands } from './base.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Ellipse } from '../geo/ellipse.js';
import type { Intersectable } from '../geo/segment.js';
import { SvgPathContext, type PathCommand } from '../svg/path.js';
const CLOUD_WIDE_INNER_X = 0.085;
const CLOUD_WIDE_INNER_Y = 0.409;
const CLOUD_WIDE_INNER_WIDTH = 0.819;
const CLOUD_WIDE_INNER_HEIGHT = 0.548;
const CLOUD_WIDE_ASPECT_BOUNDARY =
  (1 + CLOUD_WIDE_INNER_WIDTH / CLOUD_WIDE_INNER_HEIGHT) / 2;
const CLOUD_TALL_INNER_X = 0.228;
const CLOUD_TALL_INNER_Y = 0.179;
const CLOUD_TALL_INNER_WIDTH = 0.549;
const CLOUD_TALL_INNER_HEIGHT = 0.82;
const CLOUD_TALL_ASPECT_BOUNDARY =
  (1 + CLOUD_TALL_INNER_WIDTH / CLOUD_TALL_INNER_HEIGHT) / 2;
const CLOUD_SQUARE_INNER_X = 0.167;
const CLOUD_SQUARE_INNER_Y = 0.335;
const CLOUD_SQUARE_INNER_WIDTH = 0.663;
const CLOUD_SQUARE_INNER_HEIGHT = 0.663;
function cloudPath(box: Box): SvgPathContext {
  let pc = new SvgPathContext(box.TopLeft, box.Width / 834, box.Height / 523);

  pc.StartAt(pc.Absolute(137.833, 182.833));
  pc.C(true, 0, 5.556, -5.556, 11.111, -11.111, 11.111);
  pc.C(true, -70.833, 6.944, -126.389, 77.778, -126.389, 163.889);
  pc.C(true, 0, 91.667, 62.5, 165.278, 141.667, 165.278);
  pc.H(true, 537.5);
  pc.C(true, 84.723, 0, 154.167, -79.167, 154.167, -175);
  pc.C(true, 0, -91.667, -63.89, -168.056, -144.444, -173.611);
  pc.C(true, -5.556, 0, -11.111, -4.167, -12.5, -11.111);
  pc.C(true, -18.056, -93.055, -101.39, -162.5, -198.611, -162.5);
  pc.C(true, -63.889, 0, -120.834, 29.167, -156.944, 75);
  pc.C(true, -4.167, 5.556, -11.111, 6.945, -15.278, 5.556);
  pc.C(true, -13.889, -5.556, -29.166, -8.333, -45.833, -8.333);
  pc.C(false, 196.167, 71.722, 143.389, 120.333, 137.833, 182.833);
  pc.Z();
  return pc;
}
export class ShapeCloud extends BaseShape {
  constructor(box: Box) {
    super('Cloud', box);
  }
  private innerBoxAspectRatio: number | null = 0;
  GetInnerBox(): Box {
    if (this.innerBoxAspectRatio !== null && this.innerBoxAspectRatio != 0) {
      return this.GetInnerBoxForContent(this.innerBoxAspectRatio, 1);
    } else {
      return this.GetInnerBoxForContent(this.Box.Width, this.Box.Height);
    }
  }
  GetInnerBoxForContent(width: number, height: number): Box {
    let insideTL = this.GetInsidePlacement(width, height, 0, 0);
    let aspectRatio = width / height;

    [width, height] = [this.Box.Width, this.Box.Height];
    if (aspectRatio > CLOUD_WIDE_ASPECT_BOUNDARY) {
      width *= CLOUD_WIDE_INNER_WIDTH;
      height *= CLOUD_WIDE_INNER_HEIGHT;
    } else if (aspectRatio < CLOUD_TALL_ASPECT_BOUNDARY) {
      width *= CLOUD_TALL_INNER_WIDTH;
      height *= CLOUD_TALL_INNER_HEIGHT;
    } else {
      width *= CLOUD_SQUARE_INNER_WIDTH;
      height *= CLOUD_SQUARE_INNER_HEIGHT;
    }
    return new Box(insideTL, width, height);
  }
  SetInnerBoxAspectRatio(aspectRatio: number): void {
    this.innerBoxAspectRatio = aspectRatio;
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    width += paddingX;
    height += paddingY;
    let aspectRatio = width / height;

    if (aspectRatio > CLOUD_WIDE_ASPECT_BOUNDARY) {
      return [
        Math.ceil(width / CLOUD_WIDE_INNER_WIDTH),
        Math.ceil(height / CLOUD_WIDE_INNER_HEIGHT),
      ];
    } else if (aspectRatio < CLOUD_TALL_ASPECT_BOUNDARY) {
      return [
        Math.ceil(width / CLOUD_TALL_INNER_WIDTH),
        Math.ceil(height / CLOUD_TALL_INNER_HEIGHT),
      ];
    } else {
      return [
        Math.ceil(width / CLOUD_SQUARE_INNER_WIDTH),
        Math.ceil(height / CLOUD_SQUARE_INNER_HEIGHT),
      ];
    }
  }
  GetInsidePlacement(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): Point {
    let r = this.Box;
    width += paddingX;
    height += paddingY;
    let aspectRatio = width / height;
    if (aspectRatio > CLOUD_WIDE_ASPECT_BOUNDARY) {
      return new Point(
        r.TopLeft.X + Math.ceil(r.Width * CLOUD_WIDE_INNER_X + paddingX / 2),
        r.TopLeft.Y + Math.ceil(r.Height * CLOUD_WIDE_INNER_Y + paddingY / 2),
      );
    } else if (aspectRatio < CLOUD_TALL_ASPECT_BOUNDARY) {
      return new Point(
        r.TopLeft.X + Math.ceil(r.Width * CLOUD_TALL_INNER_X + paddingX / 2),
        r.TopLeft.Y + Math.ceil(r.Height * CLOUD_TALL_INNER_Y + paddingY / 2),
      );
    } else {
      return new Point(
        r.TopLeft.X + Math.ceil(r.Width * CLOUD_SQUARE_INNER_X + paddingX / 2),
        r.TopLeft.Y + Math.ceil(r.Height * CLOUD_SQUARE_INNER_Y + paddingY / 2),
      );
    }
  }
  Perimeter(): Intersectable[] {
    return cloudPath(this.Box).Path;
  }
  GetSVGPathData(): string[] {
    return [cloudPath(this.Box).PathData()];
  }
  GetPathCommands(): PathCommand[][] {
    return pathCommands(cloudPath(this.Box));
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, defaultPadding / 2];
  }
}
