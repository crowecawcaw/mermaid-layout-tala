// Translated internal/graphbounds/bounds.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import { IsOutside, PADDING } from '../label/label.js';
import type { Node } from '../layoutgraph/node.js';
import { Kind } from '../nodeshape/kind.js';
import { MaxIconSize } from '../layoutgraph/geometry-policy.js';
import { LabelTopLeft } from '../layoutgraph/node-geometry.js';
import { modifierElementAdjustments } from '../layoutgraph/node-spatial.js';
import { fixedOrigin } from '../layoutgraph/containment.js';
import { New as invariant } from '../invariant/errors.js';
export interface BoundsWork {
  Step(): void;
  Finish(): void;
}
function isExtreme(
  nodes: Node[],
  node: Node,
  disqualifies: (n: Node) => boolean,
  guard: BoundsWork,
): boolean {
  for (const other of nodes) {
    guard.Step();
    if (other === node || !other.TopLeft) continue;
    if (disqualifies(other)) return false;
  }
  return true;
}
export function NodeBoundingBox(
  node: Node,
  all: Node[] | null,
  guard: BoundsWork,
): [Point, Point] {
  guard.Step();
  if (!node || !node.TopLeft)
    throw invariant('BinPack bounding box contains an unplaced node');
  const tl = node.TopLeft.Copy(),
    br = new Point(Round(tl.X + node.Width), Round(tl.Y + node.Height)),
    [dx, dy] = modifierElementAdjustments(node);
  if (dx !== 0 || dy !== 0) {
    tl.Y -= dy;
    br.X += dx;
  }
  tl.X -= node.LoopOffsets.get(O.Left) ?? 0;
  tl.Y -= node.LoopOffsets.get(O.Top) ?? 0;
  br.X += node.LoopOffsets.get(O.Right) ?? 0;
  br.Y += node.LoopOffsets.get(O.Bottom) ?? 0;
  if (node.Label && IsOutside(node.Label.Position) && all !== null) {
    const p = LabelTopLeft(
      node,
      node.Label.Position,
      node.Label.Width,
      node.Label.Height,
    );
    if (p.X < tl.X) {
      const extreme = isExtreme(
        all,
        node,
        (n) => n.TopLeft!.X < node.TopLeft!.X,
        guard,
      );
      tl.X = Math.floor(p.X - (extreme ? PADDING : 2 * PADDING));
    }
    if (p.Y < tl.Y) {
      const extreme = isExtreme(
        all,
        node,
        (n) => n.TopLeft!.Y < node.TopLeft!.Y,
        guard,
      );
      tl.Y = Math.floor(p.Y - (extreme ? PADDING : 2 * PADDING));
    }
    if (p.X > br.X) {
      const extreme = isExtreme(
        all,
        node,
        (n) => n.TopLeft!.X + n.Width > node.TopLeft!.X + node.Width,
        guard,
      );
      br.X = Math.ceil(
        p.X + node.Label.Width + (extreme ? PADDING : 2 * PADDING),
      );
    }
    if (p.Y > br.Y) {
      const extreme = isExtreme(
        all,
        node,
        (n) => n.TopLeft!.Y + n.Height > node.TopLeft!.Y + node.Height,
        guard,
      );
      br.Y = Math.ceil(
        p.Y + node.Label.Height + (extreme ? PADDING : 2 * PADDING),
      );
    }
  }
  if (
    node.Icon &&
    node.shapeType !== Kind.Image &&
    IsOutside(node.Icon.Position) &&
    all !== null
  ) {
    const p = LabelTopLeft(node, node.Icon.Position, MaxIconSize, MaxIconSize),
      pad = 2 * PADDING;
    tl.X = Math.min(tl.X, Math.floor(p.X - pad));
    tl.Y = Math.min(tl.Y, Math.floor(p.Y - pad));
    br.X = Math.max(br.X, Math.ceil(p.X + MaxIconSize + pad));
    br.Y = Math.max(br.Y, Math.ceil(p.Y + MaxIconSize + pad));
  }
  return [tl, br];
}
export function BoundingBox(nodes: Node[], guard: BoundsWork): [Point, Point] {
  if (nodes.length === 0) {
    guard.Finish();
    return [new Point(-Infinity, -Infinity), new Point(Infinity, Infinity)];
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    const [tl, br] = NodeBoundingBox(node, nodes, guard);
    minX = Math.min(minX, tl.X);
    minY = Math.min(minY, tl.Y);
    maxX = Math.max(maxX, br.X);
    maxY = Math.max(maxY, br.Y);
  }
  guard.Finish();
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
function level(node: Node, guard: BoundsWork): number {
  let value = 0;
  const seen = new Set<Node>();
  for (
    let current: Node | null = node;
    current;
    current = current.container()
  ) {
    guard.Step();
    if (seen.has(current))
      throw invariant('BinPack found a cycle in container ancestry');
    seen.add(current);
    value++;
  }
  return value;
}
export function FixedOrigin(nodes: Node[], guard: BoundsWork): Point | null {
  let container: Node | null = null,
    minimum = Infinity;
  for (const node of nodes) {
    guard.Step();
    const current = node.container();
    if (!current) {
      container = null;
      break;
    }
    const n = level(current, guard);
    if (n < minimum) {
      minimum = n;
      container = current;
    }
  }
  for (const child of nodes) {
    guard.Step();
    if (child.container() !== container) continue;
    const origin = fixedOrigin(child);
    if (origin) return origin;
  }
  guard.Finish();
  return null;
}
export function FixedBoundingBox(
  nodes: Node[],
  guard: BoundsWork,
): [Point, Point] {
  let [tl, br] = BoundingBox(nodes, guard);
  const origin = FixedOrigin(nodes, guard);
  if (origin) tl = origin;
  guard.Finish();
  return [tl, br];
}
