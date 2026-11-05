// Coordinate-keyed Go geo.Point map used by routing at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
export class PointMap<T> {
  private values = new Map<number, Map<number, { point: Point; value: T }>>();
  set(point: Point, value: T): void {
    let ys = this.values.get(point.X);
    if (!ys) {
      ys = new Map();
      this.values.set(point.X, ys);
    }
    ys.set(point.Y, { point: point.Copy(), value });
  }
  get(point: Point): T | undefined {
    if (Number.isNaN(point.X) || Number.isNaN(point.Y)) return undefined;
    return this.values.get(point.X)?.get(point.Y)?.value;
  }
  has(point: Point): boolean {
    return (
      !Number.isNaN(point.X) &&
      !Number.isNaN(point.Y) &&
      (this.values.get(point.X)?.has(point.Y) ?? false)
    );
  }
  entries(): [Point, T][] {
    const result: [Point, T][] = [];
    for (const ys of this.values.values())
      for (const entry of ys.values()) result.push([entry.point, entry.value]);
    return result;
  }
}
