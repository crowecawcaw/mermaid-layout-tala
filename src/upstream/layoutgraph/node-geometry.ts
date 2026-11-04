// Translated geometry helpers from internal/layoutgraph/{node,graph}.go.
// D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { Spacing } from './records.js';
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { Round } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import {
  Position as P,
  IsOutside,
  GetPointOnBox,
  PADDING,
} from '../label/label.js';
import { Kind } from '../nodeshape/kind.js';
import { ContainerPadding, MaxIconSize } from './geometry-policy.js';
import { modifierElementAdjustments } from './node-spatial.js';
import { nodesFixedOrigin, moveNodeWithChildren } from './containment.js';
import type { WorkGuard } from '../limits/work.js';
export function Leftmost(nodes: Node[], node: Node): boolean {
  for (const n of nodes) {
    if (n === node || n.TopLeft === null) continue;
    if (n.TopLeft.X < node.TopLeft!.X) return false;
  }
  return true;
}
export function Topmost(nodes: Node[], node: Node): boolean {
  for (const n of nodes) {
    if (n === node || n.TopLeft === null) continue;
    if (n.TopLeft.Y < node.TopLeft!.Y) return false;
  }
  return true;
}
export function Rightmost(nodes: Node[], node: Node): boolean {
  for (const n of nodes) {
    if (n === node || n.TopLeft === null) continue;
    if (n.TopLeft.X + n.Width > node.TopLeft!.X + node.Width) return false;
  }
  return true;
}
export function Bottommost(nodes: Node[], node: Node): boolean {
  for (const n of nodes) {
    if (n === node || n.TopLeft === null) continue;
    if (n.TopLeft.Y + n.Height > node.TopLeft!.Y + node.Height) return false;
  }
  return true;
}
export function InnerBox(n: Node): Box {
  const box = n.Shape.GetInnerBox();
  return new Box(
    new Point(Round(box.TopLeft.X), Round(box.TopLeft.Y)),
    Round(box.Width),
    Round(box.Height),
  );
}
export function LabelTopLeft(
  node: Node,
  position: P,
  width: number,
  height: number,
): Point {
  return GetPointOnBox(
    position,
    IsOutside(position) ? node.Shape.GetBox() : InnerBox(node),
    PADDING,
    width,
    height,
  );
}
export function boundingBoxValues(
  node: Node,
  allNodes: Node[] | null,
  roundDimensions: boolean,
): [Point, Point] {
  const tl = node.TopLeft!.Copy(),
    br = new Point(tl.X + node.Width, tl.Y + node.Height);
  if (roundDimensions) {
    br.X = Round(br.X);
    br.Y = Round(br.Y);
  }
  const [dx, dy] = modifierElementAdjustments(node);
  if (dx !== 0 || dy !== 0) {
    tl.Y -= dy;
    br.X += dx;
  }
  tl.X -= node.LoopOffsets.get(O.Left) ?? 0;
  tl.Y -= node.LoopOffsets.get(O.Top) ?? 0;
  br.X += node.LoopOffsets.get(O.Right) ?? 0;
  br.Y += node.LoopOffsets.get(O.Bottom) ?? 0;
  if (
    node.Label !== null &&
    IsOutside(node.Label.Position) &&
    allNodes !== null
  ) {
    const labelTL = LabelTopLeft(
        node,
        node.Label.Position,
        node.Label.Width,
        node.Label.Height,
      ),
      boundaryOutsidePadding = PADDING,
      outsidePadding = 2 * PADDING;
    if (labelTL.X < tl.X)
      tl.X = Math.floor(
        labelTL.X -
          (Leftmost(allNodes, node) ? boundaryOutsidePadding : outsidePadding),
      );
    if (labelTL.Y < tl.Y)
      tl.Y = Math.floor(
        labelTL.Y -
          (Topmost(allNodes, node) ? boundaryOutsidePadding : outsidePadding),
      );
    if (labelTL.X > br.X)
      br.X = Math.ceil(
        labelTL.X +
          node.Label.Width +
          (Rightmost(allNodes, node) ? boundaryOutsidePadding : outsidePadding),
      );
    if (labelTL.Y > br.Y)
      br.Y = Math.ceil(
        labelTL.Y +
          node.Label.Height +
          (Bottommost(allNodes, node)
            ? boundaryOutsidePadding
            : outsidePadding),
      );
  }
  if (
    node.Icon !== null &&
    node.shapeType !== Kind.Image &&
    IsOutside(node.Icon.Position) &&
    allNodes !== null
  ) {
    const iconSize = MaxIconSize,
      iconTL = LabelTopLeft(node, node.Icon.Position, iconSize, iconSize),
      outsidePadding = 2 * PADDING;
    const left = Math.floor(iconTL.X - outsidePadding);
    if (left < tl.X) tl.X = left;
    const top = Math.floor(iconTL.Y - outsidePadding);
    if (top < tl.Y) tl.Y = top;
    const right = Math.ceil(iconTL.X + iconSize + outsidePadding);
    if (right > br.X) br.X = right;
    const bottom = Math.ceil(iconTL.Y + iconSize + outsidePadding);
    if (bottom > br.Y) br.Y = bottom;
  }
  return [tl, br];
}
export function nodesBoundingBox(
  nodes: Node[],
  roundDimensions: boolean,
): [Point | null, Point | null] {
  if (nodes.length === 0)
    return [new Point(-Infinity, -Infinity), new Point(Infinity, Infinity)];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    if (node.TopLeft === null) return [null, null];
    const [tl, br] = boundingBoxValues(node, nodes, roundDimensions);
    minX = Math.min(minX, tl.X);
    minY = Math.min(minY, tl.Y);
    maxX = Math.max(maxX, br.X);
    maxY = Math.max(maxY, br.Y);
  }
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
export function boundsWithWorkGuard(
  nodes: Node[],
  guard: WorkGuard,
): [Point | null, Point | null] {
  if (nodes.length === 0) {
    guard.Finish();
    return [new Point(-Infinity, -Infinity), new Point(Infinity, Infinity)];
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    guard.Step();
    if (node.TopLeft === null) return [null, null];
    if (node.Label !== null && IsOutside(node.Label.Position))
      guard.Add(2n * BigInt(nodes.length));
    const [tl, br] = boundingBoxValues(node, nodes, true);
    minX = Math.min(minX, tl.X);
    minY = Math.min(minY, tl.Y);
    maxX = Math.max(maxX, br.X);
    maxY = Math.max(maxY, br.Y);
  }
  guard.Finish();
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
export function fixedBounds(
  nodes: Node[],
  roundDimensions = true,
): [Point | null, Point | null] {
  const [tl, br] = nodesBoundingBox(nodes, roundDimensions);
  return [nodesFixedOrigin(nodes) ?? tl, br];
}
export function nodesCenter(nodes: Node[]): Point {
  const [tl, br] = nodesBoundingBox(nodes, true);
  return new Point(tl!.X + (br!.X - tl!.X) / 2, tl!.Y + (br!.Y - tl!.Y) / 2);
}
export function centerWithWorkGuard(nodes: Node[], guard: WorkGuard): Point {
  const [tl, br] = boundsWithWorkGuard(nodes, guard);
  return new Point(tl!.X + (br!.X - tl!.X) / 2, tl!.Y + (br!.Y - tl!.Y) / 2);
}
export function InsidePlacement(
  n: Node,
  width: number,
  height: number,
  padding: Spacing,
): Point {
  const padX = padding.left + padding.right,
    padY = padding.top + padding.bottom,
    p = n.Shape.GetInsidePlacement(width, height, padX, padY);
  if (n.Shape.GetType() === 'Circle') {
    const totalWidth = width + padX,
      totalHeight = height + padY,
      innerBox = n.Shape.GetInnerBox();
    if (innerBox.Width > totalWidth) p.X += (innerBox.Width - totalWidth) / 2;
    if (innerBox.Height > totalHeight)
      p.Y += (innerBox.Height - totalHeight) / 2;
  }
  p.X = Round(p.X);
  p.Y = Round(p.Y);
  p.X -= Round(padX / 2) - padding.left;
  p.Y -= Round(padY / 2) - padding.top;
  return p;
}
export function IconSize(n: Node, position: P): number {
  const minDimension = Math.min(n.Width, n.Height);
  let size =
    position === P.InsideMiddleCenter
      ? 0.5 * minDimension
      : Math.min(minDimension, Math.max(32, 0.5 * minDimension));
  size = Math.min(size, MaxIconSize);
  if (!IsOutside(position)) {
    const box = InnerBox(n);
    size = Math.min(Math.max(0, box.Width - 2 * PADDING), size);
    size = Math.min(Math.max(0, box.Height - 2 * PADDING), size);
  }
  return size;
}
export function CanContain(n: Node): boolean {
  return ![Kind.Image, Kind.Code, Kind.Table, Kind.Class, Kind.Text].includes(
    n.shapeType,
  );
}
export function expandForLabels(n: Node, tl: Point, br: Point): void {
  for (const child of n.Graph!.Containers.get(n) ?? []) {
    if (
      child.Label !== null &&
      (child.TopLeft!.X === tl.X || child.TopLeft!.X + child.Width === br.X) &&
      child.Label.Width > child.Width
    ) {
      tl.X = Math.min(
        tl.X,
        Math.floor(
          child.TopLeft!.X + (child.Width / 2 - child.Label.Width / 2),
        ),
      );
      br.X = Math.max(
        br.X,
        Math.ceil(
          child.TopLeft!.X +
            child.Width -
            (child.Width / 2 - child.Label.Width / 2),
        ),
      );
    }
  }
}
export function fitToBoundingBox(
  node: Node,
  tl: Point,
  br: Point,
  padding: Spacing,
): void {
  let width = br.X - tl.X,
    height = br.Y - tl.Y;
  if (node.Label !== null && !IsOutside(node.Label.Position)) {
    const minWidth =
        node.Label.Width - padding.left - padding.right + PADDING * 4,
      minHeight =
        node.Label.Height - padding.top - padding.bottom + PADDING * 4;
    if (node.DesiredWidth === null) width = Math.max(width, minWidth);
    if (node.DesiredHeight === null) height = Math.max(height, minHeight);
  }
  const [fitWidth, fitHeight] = node.Shape.GetDimensionsToFit(
    width,
    height,
    padding.left + padding.right,
    padding.top + padding.bottom,
  );
  node.Width =
    node.DesiredWidth !== null
      ? Math.max(fitWidth, node.DesiredWidth)
      : fitWidth;
  node.Height =
    node.DesiredHeight !== null
      ? Math.max(fitHeight, node.DesiredHeight)
      : fitHeight;
}
export function fitNodeToGraph(node: Node, g: Graph, padding: Spacing): void {
  const [tl, br] = fixedBounds(g.Nodes);
  expandForLabels(node, tl!, br!);
  fitToBoundingBox(node, tl!, br!, padding);
}
export function wrapChildren(n: Node): void {
  if (!n.isContainer) return;
  const children = n.Graph!.Containers.get(n) ?? [],
    padding = containerPadding(n.Graph!, n, false),
    [tl, br] = fixedBounds(children);
  expandForLabels(n, tl!, br!);
  fitToBoundingBox(n, tl!, br!, padding);
  const innerTL = InsidePlacement(n, br!.X - tl!.X, br!.Y - tl!.Y, padding);
  n.Translate(tl!.X - innerTL.X, tl!.Y - innerTL.Y);
}
export function positionContainerChildren(n: Node, withPadding: boolean): void {
  if (!n.isContainer) return;
  const children = n.Graph!.Containers.get(n) ?? [],
    padding = withPadding
      ? containerPadding(n.Graph!, n, false)
      : { top: 0, bottom: 0, left: 0, right: 0 },
    [tl, br] = fixedBounds(children);
  expandForLabels(n, tl!, br!);
  const innerTL = InsidePlacement(n, br!.X - tl!.X, br!.Y - tl!.Y, padding),
    dx = innerTL.X - tl!.X,
    dy = innerTL.Y - tl!.Y;
  for (const child of children) moveNodeWithChildren(child, dx, dy);
}
export function containerPadding(
  g: Graph,
  container: Node | null,
  considerChildren: boolean,
): Spacing {
  let padding = ContainerPadding;
  const spacing: Spacing = {
    top: padding,
    bottom: padding,
    left: padding,
    right: padding,
  };
  if (container === null) return spacing;
  if (container.shapeType === Kind.Circle) padding /= 4;
  if (container.Icon !== null && container.shapeType !== Kind.Image)
    padding = MaxIconSize + 2 * PADDING;
  if (container.Label !== null && !IsOutside(container.Label.Position)) {
    const labelWidth = container.Label.Width + 2 * PADDING,
      labelHeight = container.Label.Height + 2 * PADDING;
    switch (container.Label.Position) {
      case P.InsideTopLeft:
      case P.InsideTopCenter:
      case P.InsideTopRight:
        spacing.top = Math.max(spacing.top, labelHeight);
        break;
      case P.InsideBottomLeft:
      case P.InsideBottomCenter:
      case P.InsideBottomRight:
        spacing.bottom = Math.max(spacing.bottom, labelHeight);
        break;
      case P.InsideMiddleLeft:
        spacing.left = Math.max(spacing.left, labelWidth);
        break;
      case P.InsideMiddleRight:
        spacing.right = Math.max(spacing.right, labelWidth);
        break;
    }
    const minContainerWidth = labelWidth + spacing.left + spacing.right;
    if (container.Width < minContainerWidth) {
      const extraPadding = Math.ceil((minContainerWidth - container.Width) / 2);
      spacing.left = Math.max(spacing.left, extraPadding);
      spacing.right = Math.max(spacing.right, extraPadding);
    }
    const minContainerHeight = labelHeight + spacing.top + spacing.bottom;
    if (container.Height < minContainerHeight) {
      const extraPadding = Math.ceil(
        (minContainerHeight - container.Height) / 2,
      );
      spacing.top = Math.max(spacing.top, extraPadding);
      spacing.bottom = Math.max(spacing.bottom, extraPadding);
    }
  }
  if (considerChildren) {
    let hasChildWithIcon = false;
    const childrenMargin: Spacing = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const child of g.Containers.get(container) ?? []) {
      if (
        !hasChildWithIcon &&
        child.Icon !== null &&
        child.shapeType !== Kind.Image &&
        !child.Icon.PositionFixed()
      )
        hasChildWithIcon = true;
      childrenMargin.left = Math.max(childrenMargin.left, child.margin.left);
      childrenMargin.right = Math.max(childrenMargin.right, child.margin.right);
      childrenMargin.top = Math.max(childrenMargin.top, child.margin.top);
      childrenMargin.bottom = Math.max(
        childrenMargin.bottom,
        child.margin.bottom,
      );
    }
    spacing.left = Math.max(
      spacing.left,
      container.padding.left + childrenMargin.left,
    );
    spacing.right = Math.max(
      spacing.right,
      container.padding.right + childrenMargin.right,
    );
    spacing.top = Math.max(
      spacing.top,
      container.padding.top + childrenMargin.top,
    );
    spacing.bottom = Math.max(
      spacing.bottom,
      container.padding.bottom + childrenMargin.bottom,
    );
    if (hasChildWithIcon) padding = MaxIconSize + 2 * PADDING;
  }
  if (container.shapeType === Kind.Circle) {
    spacing.top /= 4;
    spacing.left /= 4;
    spacing.bottom /= 4;
    spacing.right /= 4;
  }
  spacing.left = Math.max(
    spacing.left,
    Math.max(container.padding.left, padding),
  );
  spacing.right = Math.max(
    spacing.right,
    Math.max(container.padding.right, padding),
  );
  spacing.top = Math.max(spacing.top, Math.max(container.padding.top, padding));
  spacing.bottom = Math.max(
    spacing.bottom,
    Math.max(container.padding.bottom, padding),
  );
  return spacing;
}
export function mirror(node: Node, x: boolean, y: boolean): void {
  const topOffset = node.LoopOffsets.get(O.Top) ?? 0,
    leftOffset = node.LoopOffsets.get(O.Left) ?? 0,
    rightOffset = node.LoopOffsets.get(O.Right) ?? 0,
    bottomOffset = node.LoopOffsets.get(O.Bottom) ?? 0;
  if (x)
    node.TopLeft!.X = -node.TopLeft!.X - node.Width + leftOffset - rightOffset;
  if (y)
    node.TopLeft!.Y = -node.TopLeft!.Y - node.Height + topOffset - bottomOffset;
}
