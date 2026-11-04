// Translated from internal/layoutgraph/node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Point } from '../geo/point.js';
import { Orientation as O, GetOpposite } from '../geo/orientation.js';
import { Position as P, PADDING } from '../label/label.js';
import {
  NodeGap,
  ConnectedNodeGap,
  TableNodeGap,
  MaxIconSize,
} from './geometry-policy.js';
import {
  orientationAtPoint,
  modifierElementAdjustments,
} from './node-spatial.js';
import { New as invariant } from '../invariant/errors.js';
import type { Spacing } from './records.js';
export function deltaToGuarded(
  n1: Node,
  n2: Node,
  atPoint: Point | null,
  guard: { Step(): void } | null,
): number {
  if (n1 === null || n2 === null || atPoint === null)
    throw invariant('spacing check received incomplete nodes');
  let maxEdgeWidth = -9223372036854775808,
    maxEdgeHeight = -9223372036854775808,
    isConnected = false;
  for (const e of n1.Edges) {
    guard?.Step();
    if (e === null || e.From === null || e.To === null)
      throw invariant('spacing check encountered an incomplete edge');
    if (n1.Adjacent(e) === n2) {
      isConnected = true;
      if (e.MinWidth > maxEdgeWidth) maxEdgeWidth = e.MinWidth;
      if (e.MinHeight > maxEdgeHeight) maxEdgeHeight = e.MinHeight;
    }
  }
  let horizontalDelta = isConnected ? ConnectedNodeGap : NodeGap,
    verticalDelta = horizontalDelta;
  if (n1.IsTable() || n2.IsTable()) horizontalDelta = TableNodeGap;
  if (maxEdgeHeight > verticalDelta) verticalDelta = maxEdgeHeight;
  if (maxEdgeWidth > horizontalDelta) horizontalDelta = maxEdgeWidth;
  if (
    horizontalDelta === verticalDelta &&
    n1.LoopOffsets.size === 0 &&
    n2.LoopOffsets.size === 0 &&
    zeroSpacing(n1.margin) &&
    zeroSpacing(n2.margin)
  )
    return horizontalDelta;
  const o = orientationAtPoint(n1, n2, atPoint);
  if (n1.LoopOffsets.size > 0 || n2.LoopOffsets.size > 0) {
    let loopDeltas = NodeGap;
    if (n1.LoopOffsets.size > 0)
      loopDeltas += Math.trunc(n1.LoopOffsets.get(GetOpposite(o)) ?? 0);
    if (n2.LoopOffsets.size > 0)
      loopDeltas += Math.trunc(n2.LoopOffsets.get(o) ?? 0);
    if (loopDeltas > horizontalDelta) horizontalDelta = loopDeltas;
    if (loopDeltas > verticalDelta) verticalDelta = loopDeltas;
  }
  const [n1LabelWidth, n1LabelHeight] = directionalMargin(
      n1.margin,
      GetOpposite(o),
    ),
    [n2LabelWidth, n2LabelHeight] = directionalMargin(n2.margin, o);
  if (horizontalDelta < n1LabelWidth + n2LabelWidth)
    horizontalDelta = n1LabelWidth + n2LabelWidth;
  if (verticalDelta < n1LabelHeight + n2LabelHeight)
    verticalDelta = n1LabelHeight + n2LabelHeight;
  switch (o) {
    case O.Top:
    case O.Bottom:
      return verticalDelta;
    case O.Left:
    case O.Right:
      return horizontalDelta;
    default:
      return horizontalDelta < verticalDelta ? horizontalDelta : verticalDelta;
  }
}
function zeroSpacing(s: Spacing): boolean {
  return s.top === 0 && s.bottom === 0 && s.left === 0 && s.right === 0;
}
function directionalMargin(s: Spacing, o: O): [number, number] {
  switch (o) {
    case O.Bottom:
      return [0, Math.trunc(s.bottom)];
    case O.Top:
      return [0, Math.trunc(s.top)];
    case O.Right:
      return [Math.trunc(s.right), 0];
    case O.Left:
      return [Math.trunc(s.left), 0];
    case O.BottomLeft:
      return [Math.trunc(s.left), Math.trunc(s.bottom)];
    case O.BottomRight:
      return [Math.trunc(s.right), Math.trunc(s.bottom)];
    case O.TopLeft:
      return [Math.trunc(s.left), Math.trunc(s.top)];
    case O.TopRight:
      return [Math.trunc(s.right), Math.trunc(s.top)];
    default:
      return [0, 0];
  }
}
export function UpdateSpacing(n: Node): void {
  if (n.Label !== null && n.Label.PositionFixed()) {
    const width = n.Label.Width + 2 * PADDING,
      height = n.Label.Height + 2 * PADDING;
    switch (n.Label.Position) {
      case P.OutsideTopLeft:
      case P.OutsideTopCenter:
      case P.OutsideTopRight:
        n.margin.top = height;
        break;
      case P.OutsideBottomLeft:
      case P.OutsideBottomCenter:
      case P.OutsideBottomRight:
        n.margin.bottom = height;
        break;
      case P.OutsideLeftTop:
      case P.OutsideLeftMiddle:
      case P.OutsideLeftBottom:
        n.margin.left = width;
        break;
      case P.OutsideRightTop:
      case P.OutsideRightMiddle:
      case P.OutsideRightBottom:
        n.margin.right = width;
        break;
      case P.InsideTopLeft:
      case P.InsideTopCenter:
      case P.InsideTopRight:
        n.padding.top = height;
        break;
      case P.InsideBottomLeft:
      case P.InsideBottomCenter:
      case P.InsideBottomRight:
        n.padding.bottom = height;
        break;
      case P.InsideMiddleLeft:
        n.padding.left = width;
        break;
      case P.InsideMiddleRight:
        n.padding.right = width;
        break;
    }
  }
  if (n.Icon !== null && n.Icon.PositionFixed()) {
    const iconSize = MaxIconSize + 2 * PADDING;
    switch (n.Icon.Position) {
      case P.OutsideTopLeft:
      case P.OutsideTopCenter:
      case P.OutsideTopRight:
        n.margin.top = Math.max(n.margin.top, iconSize);
        break;
      case P.OutsideBottomLeft:
      case P.OutsideBottomCenter:
      case P.OutsideBottomRight:
        n.margin.bottom = Math.max(n.margin.bottom, iconSize);
        break;
      case P.OutsideLeftTop:
      case P.OutsideLeftMiddle:
      case P.OutsideLeftBottom:
        n.margin.left = Math.max(n.margin.left, iconSize);
        break;
      case P.OutsideRightTop:
      case P.OutsideRightMiddle:
      case P.OutsideRightBottom:
        n.margin.right = Math.max(n.margin.right, iconSize);
        break;
      case P.InsideTopLeft:
      case P.InsideTopCenter:
      case P.InsideTopRight:
        n.padding.top = Math.max(n.padding.top, iconSize);
        break;
      case P.InsideBottomLeft:
      case P.InsideBottomCenter:
      case P.InsideBottomRight:
        n.padding.bottom = Math.max(n.padding.bottom, iconSize);
        break;
      case P.InsideMiddleLeft:
        n.padding.left = Math.max(n.padding.left, iconSize);
        break;
      case P.InsideMiddleRight:
        n.padding.right = Math.max(n.padding.right, iconSize);
        break;
    }
  }
  const [dx, dy] = modifierElementAdjustments(n);
  if (dx !== 0 || dy !== 0) {
    n.margin.top += dy;
    n.margin.right += dx;
  }
}
