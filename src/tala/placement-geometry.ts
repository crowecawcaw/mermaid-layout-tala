import type { Point } from '../layout.js';
import type { TalaNode } from './graph.js';
import { ConnectedNodeGap } from './geometry-policy.js';

export const SideEdgeSpacing = 40;
export const IdealGapSize = 2.5 * ConnectedNodeGap;

export type Orientation = 'NONE' | 'Top' | 'TopRight' | 'Right' | 'BottomRight' | 'Bottom' | 'BottomLeft' | 'Left' | 'TopLeft';
export interface Box { topLeft: Point; width: number; height: number }

/** Port of placementcost.distanceBetweenBoxes. */
export function distanceBetweenBoxes(first: Box, second: Box): number {
  const dx = intervalGap(first.topLeft.x, first.topLeft.x + first.width, second.topLeft.x, second.topLeft.x + second.width);
  const dy = intervalGap(first.topLeft.y, first.topLeft.y + first.height, second.topLeft.y, second.topLeft.y + second.height);
  return Math.hypot(dx, dy);
}

export function intervalGap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  if (firstEnd < secondStart) return secondStart - firstEnd;
  if (secondEnd < firstStart) return firstStart - secondEnd;
  return 0;
}

export function distanceToPoint(node: TalaNode, point: Point, includeSizes: boolean): number {
  if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
  return distanceBetweenBoxes(
    { topLeft: node.topLeft, width: includeSizes ? node.width : 0, height: includeSizes ? node.height : 0 },
    { topLeft: point, width: 0, height: 0 }
  );
}

/** Port of placementcost.placementDistance for ordinary nodes. */
export function placementDistance(first: TalaNode, second: TalaNode, includeSizes: boolean): number {
  if (!first.topLeft || !second.topLeft) throw new Error('placement distance requires positioned nodes');
  const distance = distanceBetweenBoxes(
    { topLeft: first.topLeft, width: includeSizes ? first.width : 0, height: includeSizes ? first.height : 0 },
    { topLeft: second.topLeft, width: includeSizes ? second.width : 0, height: includeSizes ? second.height : 0 }
  );
  let xCenter = Math.abs(first.topLeft.x - second.topLeft.x);
  let yCenter = Math.abs(first.topLeft.y - second.topLeft.y);
  if (includeSizes) {
    xCenter = Math.abs((first.topLeft.x + first.width / 2) - (second.topLeft.x + second.width / 2)) / (first.width + second.width);
    yCenter = Math.abs((first.topLeft.y + first.height / 2) - (second.topLeft.y + second.height / 2)) / (first.height + second.height);
  }
  return distance + Math.min(xCenter, yCenter) / 20;
}

export function sizelessOrientation(node: TalaNode, other: TalaNode): Orientation {
  if (!node.topLeft || !other.topLeft) return 'NONE';
  if (node.topLeft.y < other.topLeft.y) {
    if (node.topLeft.x < other.topLeft.x) return 'TopLeft';
    if (other.topLeft.x < node.topLeft.x) return 'TopRight';
    return 'Top';
  }
  if (other.topLeft.y < node.topLeft.y) {
    if (node.topLeft.x < other.topLeft.x) return 'BottomLeft';
    if (other.topLeft.x < node.topLeft.x) return 'BottomRight';
    return 'Bottom';
  }
  if (other.topLeft.x < node.topLeft.x) return 'Right';
  if (node.topLeft.x < other.topLeft.x) return 'Left';
  return 'NONE';
}

export function directionCompass(direction: Orientation): number {
  switch (direction) {
    case 'BottomLeft': return -3;
    case 'Left': return -2;
    case 'TopLeft': return -1;
    case 'Top': return 0;
    case 'TopRight': return 1;
    case 'Right': return 2;
    case 'BottomRight': return 3;
    case 'Bottom': return 4;
    default: return 0;
  }
}

export function compassDelta(first: number, second: number): number {
  let delta = second - first;
  if (delta > 4) delta -= 8;
  else if (delta < -4) delta += 8;
  return delta;
}

export function compassAxisDelta(first: number, second: number): number {
  first = (first + 4) % 4;
  second = (second + 4) % 4;
  const delta = second - first;
  return delta === 3 ? -1 : delta;
}
