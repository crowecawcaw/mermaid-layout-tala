// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Orientation as O } from '../geo/orientation.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { SideEdgeSpacing } from './geometry.js';
import type { EdgeRouteGeometry } from './edge-route-geometry.js';

export class ObstructionRoute {
  private cornerA = false;
  private cornerB = false;
  private l1 = false;
  private l2 = false;
  constructor(
    private node: Node,
    private adjacent: Node,
    private route: EdgeRouteGeometry,
  ) {
    if (route.isSemiDiagonal) {
      switch (route.direction) {
        case O.Left:
        case O.Right:
          if (
            Math.abs(node.TopLeft!.Y - adjacent.TopLeft!.Y) <= SideEdgeSpacing
          )
            this.l1 = true;
          else if (
            Math.abs(
              node.TopLeft!.Y +
                node.Height -
                (adjacent.TopLeft!.Y + adjacent.Height),
            ) <= SideEdgeSpacing
          )
            this.l2 = true;
          break;
        case O.Top:
        case O.Bottom:
          if (
            Math.abs(node.TopLeft!.X - adjacent.TopLeft!.X) <= SideEdgeSpacing
          )
            this.l2 = true;
          else if (
            Math.abs(
              node.TopLeft!.X +
                node.Width -
                (adjacent.TopLeft!.X + adjacent.Width),
            ) <= SideEdgeSpacing
          )
            this.l1 = true;
      }
    }
  }
  bestBlocked(other: Node): boolean {
    if (
      isDescendantOf(other, this.node) ||
      isDescendantOf(other, this.adjacent)
    )
      return false;
    const { nodeVal: a, adjacentNodeVal: b, isDiagonal } = this.route;
    if (!isDiagonal) return passesThrough(other, a, b);
    if (
      !this.cornerA &&
      (passesThrough(other, a, new Point(a.X, b.Y)) ||
        passesThrough(other, b, new Point(a.X, b.Y)))
    )
      this.cornerA = true;
    if (
      !this.cornerB &&
      (passesThrough(other, a, new Point(b.X, a.Y)) ||
        passesThrough(other, b, new Point(b.X, a.Y)))
    )
      this.cornerB = true;
    return this.cornerA && this.cornerB;
  }
  alternateBlocked(other: Node): boolean {
    if (
      isDescendantOf(other, this.node) ||
      isDescendantOf(other, this.adjacent)
    )
      return false;
    let node = this.node,
      adjacent = this.adjacent;
    const dir = this.route.direction;
    if (dir === O.Bottom || dir === O.Right)
      [node, adjacent] = [adjacent, node];
    const a = node.Center(),
      b = adjacent.Center();
    if (dir === O.Top || dir === O.Bottom) {
      const floor = Math.max(node.TopLeft!.X, adjacent.TopLeft!.X);
      const ceil = Math.min(
        node.TopLeft!.X + node.Width,
        adjacent.TopLeft!.X + adjacent.Width,
      );
      if (!this.l2) {
        const minX = Math.min(node.TopLeft!.X, adjacent.TopLeft!.X),
          x = minX + Math.abs(floor - minX) / 2;
        if (
          node.TopLeft!.X < adjacent.TopLeft!.X &&
          (passesThrough(other, new Point(x, a.Y), new Point(x, b.Y)) ||
            passesThrough(other, new Point(x, b.Y), b))
        )
          this.l2 = true;
        if (
          node.TopLeft!.X > adjacent.TopLeft!.X &&
          (passesThrough(other, a, new Point(x, a.Y)) ||
            passesThrough(other, new Point(x, b.Y), new Point(x, a.Y)))
        )
          this.l2 = true;
      }
      if (!this.l1) {
        const maxX = Math.max(
            node.TopLeft!.X + node.Width,
            adjacent.TopLeft!.X + adjacent.Width,
          ),
          x = maxX - Math.abs(ceil - maxX) / 2;
        if (
          node.TopLeft!.X + node.Width > adjacent.TopLeft!.X + adjacent.Width &&
          (passesThrough(other, new Point(x, a.Y), new Point(x, b.Y)) ||
            passesThrough(other, b, new Point(x, b.Y)))
        )
          this.l1 = true;
        if (
          node.TopLeft!.X + node.Width < adjacent.TopLeft!.X + adjacent.Width &&
          (passesThrough(other, a, new Point(x, a.Y)) ||
            passesThrough(other, new Point(x, b.Y), new Point(x, a.Y)))
        )
          this.l1 = true;
      }
    } else if (dir === O.Left || dir === O.Right) {
      const floor = Math.max(node.TopLeft!.Y, adjacent.TopLeft!.Y);
      const ceil = Math.min(
        node.TopLeft!.Y + node.Height,
        adjacent.TopLeft!.Y + adjacent.Height,
      );
      if (!this.l1) {
        const minY = Math.min(node.TopLeft!.Y, adjacent.TopLeft!.Y),
          y = minY + Math.abs(floor - minY) / 2;
        if (
          node.TopLeft!.Y < adjacent.TopLeft!.Y &&
          (passesThrough(other, new Point(a.X, y), new Point(b.X, y)) ||
            passesThrough(other, b, new Point(b.X, y)))
        )
          this.l1 = true;
        if (
          node.TopLeft!.Y > adjacent.TopLeft!.Y &&
          (passesThrough(other, a, new Point(a.X, y)) ||
            passesThrough(other, new Point(b.X, y), new Point(a.X, y)))
        )
          this.l1 = true;
      }
      if (!this.l2) {
        const maxY = Math.max(
            node.TopLeft!.Y + node.Height,
            adjacent.TopLeft!.Y + adjacent.Height,
          ),
          y = maxY - Math.abs(ceil - maxY) / 2;
        if (
          node.TopLeft!.Y + node.Height >
            adjacent.TopLeft!.Y + adjacent.Height &&
          (passesThrough(other, new Point(a.X, y), new Point(b.X, y)) ||
            passesThrough(other, b, new Point(b.X, y)))
        )
          this.l2 = true;
        if (
          node.TopLeft!.Y + node.Height <
            adjacent.TopLeft!.Y + adjacent.Height &&
          (passesThrough(other, a, new Point(a.X, y)) ||
            passesThrough(other, new Point(b.X, y), new Point(a.X, y)))
        )
          this.l2 = true;
      }
    } else throw new Error('did not expect diagonal');
    return this.l1 && this.l2;
  }
}
