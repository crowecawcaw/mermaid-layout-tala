// Translated from lib/shape/shape.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round, EuclideanDistance } from '../geo/math.js';
import { Segment, type Intersectable } from '../geo/segment.js';
import type { SvgPathContext, PathCommand } from '../svg/path.js';
export const defaultPadding = 40;
export class BaseShape {
  constructor(
    public Type: string,
    public Box: Box,
  ) {}
  Is(type: string): boolean {
    return this.Type === type;
  }
  GetType(): string {
    return this.Type;
  }
  AspectRatio1(): boolean {
    return false;
  }
  IsRectangular(): boolean {
    return false;
  }
  GetBox(): Box {
    return this.Box;
  }
  GetInnerBox(): Box {
    return this.Box;
  }
  GetInnerBoxForContent(_width: number, _height: number): Box | null {
    return null;
  }
  SetInnerBoxAspectRatio(_aspectRatio: number): void {}
  GetInsidePlacement(
    _width: number,
    _height: number,
    paddingX: number,
    paddingY: number,
  ): Point {
    const tl = this.GetInnerBox().TopLeft;
    return new Point(tl.X + paddingX / 2, tl.Y + paddingY / 2);
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    paddingX: number,
    paddingY: number,
  ): [number, number] {
    return [Math.ceil(width + paddingX), Math.ceil(height + paddingY)];
  }
  GetDefaultPadding(): [number, number] {
    return [defaultPadding, defaultPadding];
  }
  Perimeter(): Intersectable[] {
    return [];
  }
  GetSVGPathData(): string[] {
    return [];
  }
}
export interface PathCommandProvider {
  GetPathCommands(): PathCommand[][];
}
export function GetPathCommands(s: BaseShape): PathCommand[][] {
  return 'GetPathCommands' in s
    ? (s as BaseShape & PathCommandProvider).GetPathCommands()
    : [];
}
export function pathCommands(...paths: SvgPathContext[]): PathCommand[][] {
  return paths.map((p) => p.PathCommands());
}
export function TraceToShapeBorder(
  shape: BaseShape,
  rectBorderPoint: Point,
  prevPoint: Point,
): Point {
  if (shape.Is('') || shape.IsRectangular()) return rectBorderPoint;
  let scale = shape.GetBox().Width;
  if (prevPoint.X === rectBorderPoint.X) scale = shape.GetBox().Height;
  const vector = prevPoint.VectorTo(rectBorderPoint).AddLength(scale),
    extended = new Segment(prevPoint, prevPoint.AddVector(vector));
  let closestD = Infinity,
    closestPoint = rectBorderPoint;
  for (const segment of shape.Perimeter())
    for (const point of segment.Intersections(extended)) {
      const d = EuclideanDistance(
        rectBorderPoint.X,
        rectBorderPoint.Y,
        point.X,
        point.Y,
      );
      if (d < closestD) {
        closestD = d;
        closestPoint = point;
      }
    }
  closestPoint.TruncateFloat32();
  return new Point(Round(closestPoint.X), Round(closestPoint.Y));
}
export function LimitAR(
  width: number,
  height: number,
  ratio: number,
): [number, number] {
  if (width > ratio * height) height = Round(width / ratio);
  else if (height > ratio * width) width = Round(height / ratio);
  return [width, height];
}
