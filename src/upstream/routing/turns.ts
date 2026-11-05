// Translated from internal/routing/turns.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
export interface IdealTurnAxis {
  isX: boolean;
  val: number;
}
export function idealTurnAxes(a: Node, b: Node): IdealTurnAxis[] {
  const x1 = a.TopLeft!.X,
    y1 = a.TopLeft!.Y,
    x1b = x1 + a.Width,
    y1b = y1 + a.Height;
  const x2 = b.TopLeft!.X,
    y2 = b.TopLeft!.Y,
    x2b = x2 + b.Width,
    y2b = y2 + b.Height;
  const left = x2b < x1,
    right = x1b < x2,
    top = y2b < y1,
    bottom = y1b < y2;
  const axes: IdealTurnAxis[] = [];
  if (top && left)
    axes.push(
      { isX: true, val: (x1 + x2b) / 2 },
      { isX: false, val: (y1 + y2b) / 2 },
    );
  else if (left && bottom)
    axes.push(
      { isX: true, val: (x1 + x2b) / 2 },
      { isX: false, val: (y2 + y1b) / 2 },
    );
  else if (bottom && right)
    axes.push(
      { isX: true, val: (x2 + x1b) / 2 },
      { isX: false, val: (y2 + y1b) / 2 },
    );
  else if (right && top)
    axes.push(
      { isX: true, val: (x2 + x1b) / 2 },
      { isX: false, val: (y1 + y2b) / 2 },
    );
  else if (left) axes.push({ isX: true, val: (x1 + x2b) / 2 });
  else if (right) axes.push({ isX: true, val: (x2 + x1b) / 2 });
  else if (bottom) axes.push({ isX: false, val: (y2 + y1b) / 2 });
  else if (top) axes.push({ isX: false, val: (y1 + y2b) / 2 });
  return axes;
}
