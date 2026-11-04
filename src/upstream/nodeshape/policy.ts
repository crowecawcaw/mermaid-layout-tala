// Translated from internal/nodeshape/shape.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Box } from '../geo/box.js';
import type { Point, RelativePoint } from '../geo/point.js';
import type { Orientation } from '../geo/orientation.js';
import type { Position } from '../label/label.js';
import { BaseShape, GetPathCommands } from '../shape/base.js';
import { NewShape } from '../shape/new-shape.js';
import type { PathCommand } from '../svg/path.js';
import type { Intersectable } from '../geo/segment.js';
export enum LabelTier {
  Good,
  OK,
  Unideal,
  Bad,
}
/** Upstream shape.Shape embedding, with the TALA policy methods below. */
export abstract class ShapePolicy {
  constructor(
    protected readonly box: Box,
    private readonly geometry: BaseShape = NewShape('', box),
  ) {}
  Is(type: string): boolean {
    return this.geometry.Is(type);
  }
  GetType(): string {
    return this.geometry.GetType();
  }
  AspectRatio1(): boolean {
    return this.geometry.AspectRatio1();
  }
  IsRectangular(): boolean {
    return this.geometry.IsRectangular();
  }
  GetInnerBox(): Box {
    return this.geometry.GetInnerBox();
  }
  GetInnerBoxForContent(width: number, height: number): Box | null {
    return this.geometry.GetInnerBoxForContent(width, height);
  }
  SetInnerBoxAspectRatio(ratio: number): void {
    this.geometry.SetInnerBoxAspectRatio(ratio);
  }
  GetInsidePlacement(
    width: number,
    height: number,
    px: number,
    py: number,
  ): Point {
    return this.geometry.GetInsidePlacement(width, height, px, py);
  }
  GetDimensionsToFit(
    width: number,
    height: number,
    px: number,
    py: number,
  ): [number, number] {
    return this.geometry.GetDimensionsToFit(width, height, px, py);
  }
  GetDefaultPadding(): [number, number] {
    return this.geometry.GetDefaultPadding();
  }
  Perimeter(): Intersectable[] {
    return this.geometry.Perimeter();
  }
  GetSVGPathData(): string[] {
    return this.geometry.GetSVGPathData();
  }
  GetPathCommands(): PathCommand[][] {
    return GetPathCommands(this.geometry);
  }

  GetBox(): Box {
    return this.box;
  }
  abstract LabelPositionPreferences(tier: LabelTier): Set<Position>;
  abstract SnapPointPercentages(): RelativePoint[][];
  abstract PortIndices(orientation: Orientation): number[];
  abstract MirroredPortIndices(): Map<number, number>;
  abstract CenterPortIndices(): number[];
  abstract CenterPortIndex(orientation: Orientation): number;
}
