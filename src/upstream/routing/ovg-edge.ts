// Translated from internal/routing/ovg_edge.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { OVGNode } from './ovg-node.js';
export class OVGEdge {
  Distance = 0;
  constructor(
    public From: OVGNode,
    public To: OVGNode,
  ) {}
  isVertical(): boolean {
    return this.From.X === this.To.X;
  }
  isHorizontal(): boolean {
    return this.From.Y === this.To.Y;
  }
  sharePoints(other: OVGEdge): boolean {
    return (
      this.From.Point.Equals(other.From.Point) ||
      this.From.Point.Equals(other.To.Point) ||
      this.To.Point.Equals(other.From.Point) ||
      this.To.Point.Equals(other.To.Point)
    );
  }
}
