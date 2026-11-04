// Translated internal/placementcost/obstruction_bounds.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';

export class ObstructionBounds {
  constructor(
    readonly left = 0,
    readonly top = 0,
    readonly right = 0,
    readonly bottom = 0,
    readonly usable = false,
  ) {}

  including(other: ObstructionBounds): ObstructionBounds {
    return new ObstructionBounds(
      Math.min(this.left, other.left),
      Math.min(this.top, other.top),
      Math.max(this.right, other.right),
      Math.max(this.bottom, other.bottom),
      this.usable && other.usable,
    );
  }

  excludes(node: Node | null): boolean {
    if (!this.usable || node === null || node.TopLeft === null) return false;
    const { X: x, Y: y } = node.TopLeft;
    const right = x + node.Width,
      bottom = y + node.Height;
    if (![x, y, right, bottom].every(Number.isFinite)) return false;
    return (
      (x < this.left && right < this.left) ||
      (x > this.right && right > this.right) ||
      (y < this.top && bottom < this.top) ||
      (y > this.bottom && bottom > this.bottom)
    );
  }
}

export function scoringNodeBounds(node: Node | null): ObstructionBounds {
  if (node === null || node.TopLeft === null) return new ObstructionBounds();
  const { X: x, Y: y } = node.TopLeft;
  const right = x + node.Width,
    bottom = y + node.Height;
  const bound = Number.MAX_VALUE / 8;
  const usable =
    x >= -bound &&
    x <= bound &&
    y >= -bound &&
    y <= bound &&
    right >= -bound &&
    right <= bound &&
    bottom >= -bound &&
    bottom <= bound;
  return new ObstructionBounds(
    Math.min(x, right),
    Math.min(y, bottom),
    Math.max(x, right),
    Math.max(y, bottom),
    usable,
  );
}
