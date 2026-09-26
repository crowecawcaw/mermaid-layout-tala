import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { ConnectedNodeGap } from './geometry-policy.js';
import { compassAxisDelta, compassDelta, directionCompass, distanceBetweenBoxes, distanceToPoint, placementDistance, sizedOrientation, type Orientation } from './placement-geometry.js';

/** The sized phase halves TALA's cached turn cost after sizeless placement. */
export function sizedTurnCost(graph: TalaGraph): number {
  let longest = 0;
  let hasPositionedEdge = false;
  for (const edge of graph.edges) {
    if (!edge.from.topLeft || !edge.to.topLeft) continue;
    hasPositionedEdge = true;
    longest = Math.max(longest, distanceBetweenBoxes(
      { topLeft: edge.from.topLeft, width: edge.from.width, height: edge.from.height },
      { topLeft: edge.to.topLeft, width: edge.to.width, height: edge.to.height },
    ));
  }
  return hasPositionedEdge ? 0.0625 * graph.edges.length * Math.max(ConnectedNodeGap, longest) : 0;
}

/** Ordinary-node branch of placementcost.NodeEdgeLength with sized geometry. */
export function sizedNodeEdgeLength(node: TalaNode, graph: TalaGraph, turnCost = sizedTurnCost(graph)): number {
  if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
  const preferred = graph.directions.get(node.parent);
  const direction: Orientation = preferred === 'TB' ? 'Bottom'
    : preferred === 'BT' ? 'Top' : preferred === 'LR' ? 'Right'
    : preferred === 'RL' ? 'Left' : 'BottomRight';
  const factor = preferred ? 6 : 0.3;
  let total = 0;
  for (const edge of node.edges) {
    const other = node.adjacent(edge);
    if (!other.topLeft) continue;
    const orientation = sizedOrientation(node, other);
    if (orientation === 'NONE') continue;
    const diagonal = orientation === 'TopLeft' || orientation === 'TopRight'
      || orientation === 'BottomLeft' || orientation === 'BottomRight';
    const firstCenter = center(node), secondCenter = center(other);
    let start: Point, end: Point;
    let distance: number;
    if (diagonal) {
      start = firstCenter;
      end = secondCenter;
      const corner = { x: start.x, y: end.y };
      distance = distanceToPoint(node, corner, true) + distanceToPoint(other, corner, true) + turnCost;
    } else {
      distance = placementDistance(node, other, true);
      if (orientation === 'Top' || orientation === 'Bottom') {
        const x = (Math.max(node.topLeft.x, other.topLeft.x) + Math.min(node.topLeft.x + node.width, other.topLeft.x + other.width)) / 2;
        start = { x, y: orientation === 'Top' ? node.topLeft.y + node.height : node.topLeft.y };
        end = { x, y: orientation === 'Top' ? other.topLeft.y : other.topLeft.y + other.height };
      } else {
        const y = (Math.max(node.topLeft.y, other.topLeft.y) + Math.min(node.topLeft.y + node.height, other.topLeft.y + other.height)) / 2;
        start = { x: orientation === 'Left' ? node.topLeft.x + node.width : node.topLeft.x, y };
        end = { x: orientation === 'Left' ? other.topLeft.x : other.topLeft.x + other.width, y };
      }
    }
    const blockers = graph.containers.get(node.parent) ?? graph.nodes;
    let blocked = false;
    for (const blocker of blockers) {
      if (blocker === node || blocker === other || !blocker.topLeft) continue;
      if (diagonal) {
        const cornerA = { x: start.x, y: end.y };
        const cornerB = { x: end.x, y: start.y };
        const a = segmentIntersectsBox(start, cornerA, blocker) || segmentIntersectsBox(cornerA, end, blocker);
        const b = segmentIntersectsBox(start, cornerB, blocker) || segmentIntersectsBox(cornerB, end, blocker);
        if (a && b) { blocked = true; break; }
      } else if (segmentIntersectsBox(start, end, blocker)) { blocked = true; break; }
    }
    if (blocked) distance += turnCost * (diagonal ? 1 : 2);
    if (edge.directed || preferred) {
      const edgeDirection = edge.from === node ? opposite(orientation) : orientation;
      const preferredCompass = directionCompass(direction), edgeCompass = directionCompass(edgeDirection);
      let delta = Math.abs(compassDelta(preferredCompass, edgeCompass));
      if (!edge.directed) delta = 0.1 * delta + 0.9 * Math.abs(compassAxisDelta(preferredCompass, edgeCompass));
      distance += factor * delta * graph.cellSize * 0.25;
    }
    total += distance;
  }
  return total;
}

function center(node: TalaNode): Point {
  return { x: node.topLeft!.x + node.width / 2, y: node.topLeft!.y + node.height / 2 };
}

export function segmentIntersectsBox(start: Point, end: Point, node: TalaNode): boolean {
  const x0 = node.topLeft!.x, x1 = x0 + node.width;
  const y0 = node.topLeft!.y, y1 = y0 + node.height;
  if ((start.x < x0 && end.x < x0) || (start.x > x1 && end.x > x1)
    || (start.y < y0 && end.y < y0) || (start.y > y1 && end.y > y1)) return false;
  const contains = (point: Point) => x0 <= point.x && point.x <= x1 && y0 <= point.y && point.y <= y1;
  if (contains(start) || contains(end)) return true;
  let enter = 0, exit = 1;
  const clip = (origin: number, delta: number, low: number, high: number): boolean => {
    if (delta === 0) return low <= origin && origin <= high;
    let a = (low - origin) / delta, b = (high - origin) / delta;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a); exit = Math.min(exit, b);
    return enter <= exit;
  };
  return clip(start.x, end.x - start.x, x0, x1)
    && clip(start.y, end.y - start.y, y0, y1) && enter < exit;
}

function opposite(direction: Orientation): Orientation {
  const opposites: Record<Orientation, Orientation> = {
    NONE: 'NONE', Top: 'Bottom', TopRight: 'BottomLeft', Right: 'Left',
    BottomRight: 'TopLeft', Bottom: 'Top', BottomLeft: 'TopRight', Left: 'Right', TopLeft: 'BottomRight',
  };
  return opposites[direction];
}
