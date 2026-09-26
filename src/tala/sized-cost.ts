import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { SideEdgeSpacing, compassAxisDelta, compassDelta, directionCompass, distanceToPoint, placementDistance, sizedOrientation, type Orientation } from './placement-geometry.js';

/** The sized phase halves TALA's cached turn cost after sizeless placement. */
export function sizedTurnCost(graph: TalaGraph): number {
  return graph.turnCost() / 2;
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
    const semiDiagonal = !diagonal && (orientation === 'Top' || orientation === 'Bottom'
      ? Math.abs(node.topLeft.x - other.topLeft.x) > SideEdgeSpacing
        || Math.abs(node.topLeft.x + node.width - other.topLeft.x - other.width) > SideEdgeSpacing
      : Math.abs(node.topLeft.y - other.topLeft.y) > SideEdgeSpacing
        || Math.abs(node.topLeft.y + node.height - other.topLeft.y - other.height) > SideEdgeSpacing);
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
    let firstBlockedIndex = -1;
    let cornerABlocked = false, cornerBBlocked = false;
    for (let blockerIndex = 0; blockerIndex < blockers.length; blockerIndex++) {
      const blocker = blockers[blockerIndex]!;
      if (blocker === node || blocker === other || !blocker.topLeft) continue;
      if (diagonal) {
        const cornerA = { x: start.x, y: end.y };
        const cornerB = { x: end.x, y: start.y };
        cornerABlocked ||= segmentIntersectsBox(start, cornerA, blocker) || segmentIntersectsBox(cornerA, end, blocker);
        cornerBBlocked ||= segmentIntersectsBox(start, cornerB, blocker) || segmentIntersectsBox(cornerB, end, blocker);
        if (cornerABlocked && cornerBBlocked) { blocked = true; break; }
      } else if (segmentIntersectsBox(start, end, blocker)) {
        blocked = true;
        firstBlockedIndex = blockerIndex;
        break;
      }
    }
    if (blocked) distance += turnCost * (diagonal ? 1
      : semiDiagonal && !semiDiagonalAlternateBlocked(node, other, orientation, blockers.slice(firstBlockedIndex)) ? 1 : 2);
    if (edge.directed || preferred) {
      const edgeDirection = edge.from === node ? opposite(orientation) : orientation;
      const preferredCompass = directionCompass(direction), edgeCompass = directionCompass(edgeDirection);
      let delta = Math.abs(compassDelta(preferredCompass, edgeCompass));
      if (!edge.directed) delta = 0.1 * delta + 0.9 * Math.abs(compassAxisDelta(preferredCompass, edgeCompass));
      distance += factor * delta * graph.cellSize * 0.25;
    }
    total += distance;
  }
  return total + flowContinuityCost(node, turnCost);
}

/** Upstream placementcost.flowContinuityCost for ordinary directed edges. */
export function flowContinuityCost(node: TalaNode, turnCost: number): number {
  if (!node.topLeft || node.isGroup || node.edges.length < 2 || node.edges.length > 8) return 0;
  const rays = new Map<TalaNode, { x: number; y: number; directions: number }>();
  const cx = node.topLeft.x + node.width / 2;
  const cy = node.topLeft.y + node.height / 2;
  for (const edge of node.edges) {
    if (!edge.directed || edge.from === edge.to) continue;
    const adjacent = node.adjacent(edge);
    if (!adjacent.topLeft || adjacent.parent !== node.parent) continue;
    const direction = edge.to === node ? 1 : 2;
    const existing = rays.get(adjacent);
    if (existing) { existing.directions |= direction; continue; }
    const x = adjacent.topLeft.x + adjacent.width / 2 - cx;
    const y = adjacent.topLeft.y + adjacent.height / 2 - cy;
    const length = Math.hypot(x, y);
    if (length !== 0) rays.set(adjacent, { x: x / length, y: y / length, directions: direction });
  }
  const values = [...rays.values()];
  let spine = Infinity, branchSum = 0, branches = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i]!, b = values[j]!;
      const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
      if ((a.directions & 1) && (b.directions & 2)
        || (a.directions & 2) && (b.directions & 1)) spine = Math.min(spine, 1 + dot);
      if (a.directions & b.directions) {
        branchSum += Math.max(0, 2 * dot - 1);
        branches++;
      }
    }
  }
  const cost = (Number.isFinite(spine) ? spine : 0) + (branches ? branchSum / branches : 0);
  return turnCost * cost;
}

function semiDiagonalAlternateBlocked(node: TalaNode, other: TalaNode,
  orientation: Orientation, blockers: readonly TalaNode[]): boolean {
  let l1 = false, l2 = false;
  const first = node.topLeft!, second = other.topLeft!;
  if (orientation === 'Top' || orientation === 'Bottom') {
    if (Math.abs(first.x - second.x) <= SideEdgeSpacing) l2 = true;
    else if (Math.abs(first.x + node.width - second.x - other.width) <= SideEdgeSpacing) l1 = true;
  } else {
    if (Math.abs(first.y - second.y) <= SideEdgeSpacing) l1 = true;
    else if (Math.abs(first.y + node.height - second.y - other.height) <= SideEdgeSpacing) l2 = true;
  }
  const source = orientation === 'Bottom' || orientation === 'Right' ? other : node;
  const target = source === node ? other : node;
  const a = source.topLeft!, b = target.topLeft!;
  const ac = center(source), bc = center(target);
  const passes = (blocker: TalaNode, from: Point, to: Point) => segmentIntersectsBox(from, to, blocker);
  for (const blocker of blockers) {
    if (blocker === node || blocker === other || !blocker.topLeft) continue;
    if (orientation === 'Top' || orientation === 'Bottom') {
      const floor = Math.max(a.x, b.x), ceil = Math.min(a.x + source.width, b.x + target.width);
      if (!l2) {
        const x = Math.min(a.x, b.x) + Math.abs(floor - Math.min(a.x, b.x)) / 2;
        const top = { x, y: ac.y }, bottom = { x, y: bc.y };
        if (a.x < b.x) l2 = passes(blocker, top, bottom) || passes(blocker, bottom, bc);
        else if (a.x > b.x) l2 = passes(blocker, ac, top) || passes(blocker, bottom, top);
      }
      if (!l1) {
        const maxX = Math.max(a.x + source.width, b.x + target.width);
        const x = maxX - Math.abs(ceil - maxX) / 2;
        const top = { x, y: ac.y }, bottom = { x, y: bc.y };
        if (a.x + source.width > b.x + target.width) l1 = passes(blocker, top, bottom) || passes(blocker, bc, bottom);
        else if (a.x + source.width < b.x + target.width) l1 = passes(blocker, ac, top) || passes(blocker, bottom, top);
      }
    } else {
      const floor = Math.max(a.y, b.y), ceil = Math.min(a.y + source.height, b.y + target.height);
      if (!l1) {
        const y = Math.min(a.y, b.y) + Math.abs(floor - Math.min(a.y, b.y)) / 2;
        const left = { x: ac.x, y }, right = { x: bc.x, y };
        if (a.y < b.y) l1 = passes(blocker, left, right) || passes(blocker, bc, right);
        else if (a.y > b.y) l1 = passes(blocker, ac, left) || passes(blocker, right, left);
      }
      if (!l2) {
        const maxY = Math.max(a.y + source.height, b.y + target.height);
        const y = maxY - Math.abs(ceil - maxY) / 2;
        const left = { x: ac.x, y }, right = { x: bc.x, y };
        if (a.y + source.height > b.y + target.height) l2 = passes(blocker, left, right) || passes(blocker, bc, right);
        else if (a.y + source.height < b.y + target.height) l2 = passes(blocker, ac, left) || passes(blocker, right, left);
      }
    }
    if (l1 && l2) return true;
  }
  return l1 && l2;
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
