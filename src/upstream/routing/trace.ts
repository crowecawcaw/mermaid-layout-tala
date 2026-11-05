// Translated from internal/routing/trace.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point, IntersectionPoint } from '../geo/point.js';
import { Orientation } from '../geo/orientation.js';
import { TraceToShapeBorder } from '../shape/base.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { modifierElementAdjustments } from '../layoutgraph/node-spatial.js';
import { pointToPortOrientation } from '../layoutgraph/ports.js';

export function traceToShapeBorder(edge: Edge | null): void {
  if (!edge || !edge.From || !edge.To || edge.Points.length < 2) return;
  const from = edge.From,
    to = edge.To;
  let fromPointer: Point | null = null,
    fromValue: Point | null = null,
    toPointer: Point | null = null,
    toValue: Point | null = null;
  const adjust = (
    node: Node,
    point: Point,
    next: Point,
    source: boolean,
  ): void => {
    const [dx, dy] = modifierElementAdjustments(node),
      tl = node.TopLeft!;
    if (
      (dx === 0 && dy === 0) ||
      !(point.X > tl.X + dx && point.Y < tl.Y + node.Height - dy)
    )
      return;
    const saved = tl.Copy();
    if (source) {
      fromPointer = tl;
      fromValue = saved;
    } else {
      toPointer = tl;
      toValue = saved;
    }
    const orientation = pointToPortOrientation(node, point);
    let intersection: Point | null = null;
    if (orientation === Orientation.Right || point.X === saved.X + node.Width) {
      tl.X += dx;
      const topRight = new Point(tl.X + node.Width, tl.Y),
        bottomRight = new Point(topRight.X, topRight.Y + node.Height);
      intersection = IntersectionPoint(point, next, topRight, bottomRight);
    } else if (orientation === Orientation.Top || point.Y === saved.Y) {
      tl.Y -= dy;
      const topRight = new Point(tl.X + node.Width, tl.Y);
      intersection = IntersectionPoint(point, next, tl, topRight);
    }
    if (intersection) {
      point.X = intersection.X;
      point.Y = intersection.Y;
    }
  };
  try {
    const last = edge.Points.length - 1;
    adjust(from, edge.Points[0]!, edge.Points[1]!, true);
    adjust(to, edge.Points[last]!, edge.Points[last - 1]!, false);
    const start = TraceToShapeBorder(
      from.Shape,
      edge.Points[0]!,
      edge.Points[1]!,
    );
    if (start) edge.Points[0] = start;
    const end = TraceToShapeBorder(
      to.Shape,
      edge.Points[last]!,
      edge.Points[last - 1]!,
    );
    if (end) edge.Points[last] = end;
  } finally {
    if (toPointer && toValue) {
      Object.assign(toPointer, toValue);
      to.TopLeft = toPointer;
    }
    if (fromPointer && fromValue) {
      Object.assign(fromPointer, fromValue);
      from.TopLeft = fromPointer;
    }
  }
}
