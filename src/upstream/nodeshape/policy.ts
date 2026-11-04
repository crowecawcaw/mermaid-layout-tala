// Translated from internal/nodeshape/shape.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Box } from '../geo/box.js';
import type { RelativePoint } from '../geo/point.js';
import type { Orientation } from '../geo/orientation.js';
import type { Position } from '../label/label.js';
export enum LabelTier {
  Good,
  OK,
  Unideal,
  Bad,
}
/** TALA policy methods. The underlying lib/shape geometry is translated separately. */
export abstract class ShapePolicy {
  constructor(protected readonly box: Box) {}
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
