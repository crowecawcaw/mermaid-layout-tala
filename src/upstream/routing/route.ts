// Translated from internal/routing/route.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { IsDiagonal, IsHorizontal, IsVertical } from '../geo/orientation.js';
import type { Edge } from '../layoutgraph/edge.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import type { OVGNode } from './ovg-node.js';
export class Route {
  FromPort = new Point(0, 0);
  ToPort = new Point(0, 0);
  constructor(
    public GEdge: Edge,
    public OVGNodes: OVGNode[],
  ) {}
  createSegmentEndpoints(): Point[] {
    const points = [this.OVGNodes[1]!.Point.Copy()];
    for (let i = 2; i < this.OVGNodes.length - 2; i++) {
      const last = this.OVGNodes[i - 1]!.Point,
        current = this.OVGNodes[i]!.Point,
        next = this.OVGNodes[i + 1]!.Point;
      if (current.X === last.X && current.X !== next.X)
        points.push(current.Copy());
      else if (current.Y === last.Y && current.Y !== next.Y)
        points.push(current.Copy());
    }
    points.push(this.OVGNodes[this.OVGNodes.length - 2]!.Point.Copy());
    return points;
  }
  isEntireColinear(from: OVGNode, to: OVGNode): boolean {
    const horizontal = from.Y === to.Y;
    if (!horizontal && from.X !== to.X) return false;
    const along = (n: OVGNode) => (horizontal ? n.X : n.Y),
      cross = (n: OVGNode) => (horizontal ? n.Y : n.X),
      axis = cross(from);
    let min = along(from),
      max = along(to);
    if (max < min) [min, max] = [max, min];
    for (let i = 1; i < this.OVGNodes.length - 2; i++) {
      const a = this.OVGNodes[i]!,
        b = this.OVGNodes[i + 1]!;
      if (cross(a) !== axis || cross(b) !== axis) return false;
      let low = along(a),
        high = along(b);
      if (high < low) [low, high] = [high, low];
      if (low < min || high > max) return false;
    }
    return true;
  }
  isOpposingColinear(from: OVGNode, to: OVGNode): boolean {
    if (!this.GEdge.IsDirected()) return false;
    const horizontal = from.Y === to.Y;
    if (!horizontal && from.X !== to.X) return false;
    const along = (n: OVGNode) => (horizontal ? n.X : n.Y),
      cross = (n: OVGNode) => (horizontal ? n.Y : n.X),
      axis = cross(from);
    let min = along(from),
      max = along(to);
    if (max < min) [min, max] = [max, min];
    for (let i = 0; i < this.OVGNodes.length - 2; i++) {
      if (cross(this.OVGNodes[i + 1]!) !== axis) {
        i++;
        continue;
      }
      if (cross(this.OVGNodes[i]!) !== axis) continue;
      const a = this.OVGNodes[i]!,
        b = this.OVGNodes[i + 1]!,
        av = along(a),
        bv = along(b);
      if (bv === av) continue;
      if (av < bv) {
        if (max < av || bv < min) continue;
      } else {
        if (max < bv || av < min) continue;
      }
      let low = av,
        high = bv;
      if (high < low) [low, high] = [high, low];
      const fv = along(from),
        tv = along(to);
      if (low <= fv && fv <= high && (tv < low || high < tv)) {
        if (from.Point.Equals(a.Point) || from.Point.Equals(b.Point))
          return false;
      } else if (low <= tv && tv <= high && (fv < low || high < fv)) {
        if (to.Point.Equals(a.Point) || to.Point.Equals(b.Point)) return false;
      }
      if ((bv > av && tv < fv) || (bv < av && tv > fv)) return true;
    }
    return false;
  }
  canSwapEdgesGuarded(
    other: Route,
    all: Route[],
    guard: { Step(): void } | null,
  ): boolean {
    const e = this.GEdge,
      o = other.GEdge;
    if (e.From === e.To || o.From === o.To) return false;
    if (!(
      (e.From === o.From && e.To === o.To) ||
      (e.From === o.To && e.To === o.From)
    ))
      return false;
    const orientation = nodeOrientation(e.From, e.To);
    if (IsDiagonal(orientation)) return false;
    if (e.From === o.From && e.To === o.To) {
      if (
        IsVertical(orientation) &&
        (this.FromPort.Y !== other.FromPort.Y ||
          this.ToPort.Y !== other.ToPort.Y)
      )
        return false;
      if (
        IsHorizontal(orientation) &&
        (this.FromPort.X !== other.FromPort.X ||
          this.ToPort.X !== other.ToPort.X)
      )
        return false;
    }
    for (const route of all) {
      guard?.Step();
      if (route === this || route === other) continue;
      if (
        this.FromPort.Equals(route.FromPort) ||
        this.FromPort.Equals(route.ToPort) ||
        this.ToPort.Equals(route.FromPort) ||
        this.ToPort.Equals(route.ToPort) ||
        other.FromPort.Equals(route.FromPort) ||
        other.FromPort.Equals(route.ToPort) ||
        other.ToPort.Equals(route.FromPort) ||
        other.ToPort.Equals(route.ToPort)
      )
        return false;
    }
    return true;
  }
}
