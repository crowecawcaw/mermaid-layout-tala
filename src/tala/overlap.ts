import type { Point } from '../layout.js';
import { ConnectedNodeGap, NodeGap, TableNodeGap } from './geometry-policy.js';
import type { TalaNode } from './graph.js';
import type { Orientation } from './placement-geometry.js';

/** Upstream layoutgraph.Node.deltaTo, including ordinary label and loop spacing. */
export function nodeDelta(first: TalaNode, second: TalaNode, position = first.topLeft): number {
  const connected = first.edges.filter((edge) => first.adjacent(edge) === second);
  let horizontal = connected.length ? ConnectedNodeGap : NodeGap;
  let vertical = horizontal;
  if (first.shape?.toLowerCase() === 'table' || second.shape?.toLowerCase() === 'table') {
    horizontal = TableNodeGap;
  }
  for (const edge of connected) {
    horizontal = Math.max(horizontal, edge.minWidth);
    vertical = Math.max(vertical, edge.minHeight);
  }
  const firstMargin = labelMargin(first), secondMargin = labelMargin(second);
  if (horizontal === vertical && !first.loopOffsets && !second.loopOffsets
    && allZero(firstMargin) && allZero(secondMargin)) return horizontal;
  const orientation = position && second.topLeft
    ? orientationAt(first, second, position) : 'NONE';
  if (first.loopOffsets || second.loopOffsets) {
    const delta = NodeGap + offsetFor(first, opposite(orientation))
      + offsetFor(second, orientation);
    horizontal = Math.max(horizontal, delta);
    vertical = Math.max(vertical, delta);
  }
  const firstLabel = marginForOrientation(firstMargin, opposite(orientation));
  const secondLabel = marginForOrientation(secondMargin, orientation);
  horizontal = Math.max(horizontal, firstLabel.width + secondLabel.width);
  vertical = Math.max(vertical, firstLabel.height + secondLabel.height);
  if (orientation === 'Top' || orientation === 'Bottom') return vertical;
  if (orientation === 'Left' || orientation === 'Right') return horizontal;
  return Math.min(horizontal, vertical);
}

/** Port of Node.doesOverlapAt for ordinary boxes. */
export function doesOverlapAt(first: TalaNode, second: TalaNode, position: Point): boolean {
  if (!second.topLeft) return false;
  const delta = nodeDelta(first, second, position);
  return position.x < second.topLeft.x + second.width + delta
    && position.x + first.width + delta > second.topLeft.x
    && position.y < second.topLeft.y + second.height + delta
    && position.y + first.height + delta > second.topLeft.y;
}

interface Margin { top: number; left: number; bottom: number; right: number }
function labelMargin(node: TalaNode): Margin {
  const margin = { top: 0, left: 0, bottom: 0, right: 0 };
  if (!node.labelBBox || !node.labelPositionFixed || !node.labelPosition) return margin;
  const position = node.labelPosition;
  if (position.startsWith('OUTSIDE_TOP_')) margin.top = node.labelBBox.height + 10;
  else if (position.startsWith('OUTSIDE_BOTTOM_')) margin.bottom = node.labelBBox.height + 10;
  else if (position.startsWith('OUTSIDE_LEFT_')) margin.left = node.labelBBox.width + 10;
  else if (position.startsWith('OUTSIDE_RIGHT_')) margin.right = node.labelBBox.width + 10;
  return margin;
}

function allZero(margin: Margin): boolean {
  return margin.top === 0 && margin.left === 0 && margin.bottom === 0 && margin.right === 0;
}

function orientationAt(first: TalaNode, second: TalaNode, position: Point): Orientation {
  const other = second.topLeft!;
  if (position.y + first.height < other.y) {
    if (position.x + first.width < other.x) return 'TopLeft';
    if (other.x + second.width < position.x) return 'TopRight';
    return 'Top';
  }
  if (other.y + second.height < position.y) {
    if (position.x + first.width < other.x) return 'BottomLeft';
    if (other.x + second.width < position.x) return 'BottomRight';
    return 'Bottom';
  }
  if (other.x + second.width < position.x) return 'Right';
  if (position.x + first.width < other.x) return 'Left';
  return 'NONE';
}

function opposite(orientation: Orientation): Orientation {
  switch (orientation) {
    case 'Top': return 'Bottom';
    case 'Bottom': return 'Top';
    case 'Left': return 'Right';
    case 'Right': return 'Left';
    case 'TopLeft': return 'BottomRight';
    case 'TopRight': return 'BottomLeft';
    case 'BottomLeft': return 'TopRight';
    case 'BottomRight': return 'TopLeft';
    default: return 'NONE';
  }
}

function offsetFor(node: TalaNode, orientation: Orientation): number {
  if (orientation === 'NONE' || !node.loopOffsets) return 0;
  const key = orientation[0]!.toLowerCase().concat(orientation.slice(1)) as
    keyof NonNullable<TalaNode['loopOffsets']>;
  return node.loopOffsets[key];
}

function marginForOrientation(margin: Margin, orientation: Orientation): { width: number; height: number } {
  return {
    width: orientation.includes('Left') ? margin.left : orientation.includes('Right') ? margin.right : 0,
    height: orientation.includes('Top') ? margin.top : orientation.includes('Bottom') ? margin.bottom : 0,
  };
}
