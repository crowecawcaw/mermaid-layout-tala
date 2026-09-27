import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { axisScore } from './axis-score.js';
import { SideEdgeSpacing, compassAxisDelta, compassDelta, directionCompass,
  distanceBetweenBoxes, distanceToPoint, placementDistance, sizedOrientation, type Orientation } from './placement-geometry.js';

/** The sized phase halves TALA's cached turn cost after sizeless placement. */
export function sizedTurnCost(graph: TalaGraph): number {
  return graph.turnCost() / 2;
}

/** Ordinary-node branch of placementcost.NodeEdgeLength with sized geometry. */
export function sizedNodeEdgeLength(owner: TalaNode, graph: TalaGraph,
  turnCost = sizedTurnCost(graph), penalizeDirection = true): number {
  if (!owner.topLeft) throw new Error(`node ${owner.id} has no position`);
  const preferred = graph.directions.get(owner.parent);
  const direction: Orientation = preferred === 'TB' ? 'Bottom'
    : preferred === 'BT' ? 'Top' : preferred === 'LR' ? 'Right'
    : preferred === 'RL' ? 'Left' : 'BottomRight';
  const factor = preferred ? 6 : 0.3;
  let total = 0;
  for (const edge of owner.edges) {
    const node = graph.endpointFor(edge, edge.from === owner ? 'from' : 'to');
    const other = graph.endpointFor(edge, edge.from === owner ? 'to' : 'from');
    if (!other.topLeft) continue;
    const nodeTopLeft = node.topLeft!;
    const orientation = sizedOrientation(node, other);
    if (orientation === 'NONE') continue;
    const diagonal = orientation === 'TopLeft' || orientation === 'TopRight'
      || orientation === 'BottomLeft' || orientation === 'BottomRight';
    const semiDiagonal = !diagonal && (orientation === 'Top' || orientation === 'Bottom'
      ? Math.abs(nodeTopLeft.x - other.topLeft.x) > SideEdgeSpacing
        || Math.abs(nodeTopLeft.x + node.width - other.topLeft.x - other.width) > SideEdgeSpacing
      : Math.abs(nodeTopLeft.y - other.topLeft.y) > SideEdgeSpacing
        || Math.abs(nodeTopLeft.y + node.height - other.topLeft.y - other.height) > SideEdgeSpacing);
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
        const x = (Math.max(nodeTopLeft.x, other.topLeft.x) + Math.min(nodeTopLeft.x + node.width, other.topLeft.x + other.width)) / 2;
        start = { x, y: orientation === 'Top' ? nodeTopLeft.y + node.height : nodeTopLeft.y };
        end = { x, y: orientation === 'Top' ? other.topLeft.y : other.topLeft.y + other.height };
      } else {
        const y = (Math.max(nodeTopLeft.y, other.topLeft.y) + Math.min(nodeTopLeft.y + node.height, other.topLeft.y + other.height)) / 2;
        start = { x: orientation === 'Left' ? nodeTopLeft.x + node.width : nodeTopLeft.x, y };
        end = { x: orientation === 'Left' ? other.topLeft.x : other.topLeft.x + other.width, y };
      }
    }
    const blockers = obstructionNodes(node, other, graph);
    let blocked = false;
    let firstBlockedIndex = -1;
    let cornerABlocked = false, cornerBBlocked = false;
    for (let blockerIndex = 0; blockerIndex < blockers.length; blockerIndex++) {
      const blocker = blockers[blockerIndex]!;
      if (blocker.id === node.id || blocker.id === other.id || !blocker.topLeft) continue;
      if (node.isDescendantOf(blocker) || other.isDescendantOf(blocker)
        || blocker.isDescendantOf(node) || blocker.isDescendantOf(other)) continue;
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
    if (penalizeDirection && (edge.directed || preferred)) {
      const edgeDirection = edge.from === owner ? opposite(orientation) : orientation;
      const preferredCompass = directionCompass(direction), edgeCompass = directionCompass(edgeDirection);
      let delta = Math.abs(compassDelta(preferredCompass, edgeCompass));
      if (!edge.directed) delta = 0.1 * delta + 0.9 * Math.abs(compassAxisDelta(preferredCompass, edgeCompass));
      distance += factor * delta * graph.cellSize * 0.25;
    }
    total += distance;
  }
  if (owner.nears.size > 0) {
    let nearest = Infinity;
    for (const near of owner.nears) {
      if (!near.topLeft) { nearest = 0; continue; }
      nearest = Math.min(nearest, distanceBetweenBoxes(
        { topLeft: owner.topLeft, width: owner.width, height: owner.height },
        { topLeft: near.topLeft, width: near.width, height: near.height }));
    }
    total += nearest;
  }
  const siblings = graph.commonUncleSiblings.get(owner);
  if (siblings) total += graph.cellSize * (1 - axisScore(siblings)) * (siblings.length - 1);
  return total + flowContinuityCost(owner, turnCost);
}

function obstructionNodes(first: TalaNode, second: TalaNode, graph: TalaGraph): TalaNode[] {
  const result: TalaNode[] = [];
  const seenContainers = new Set<TalaNode | null>();
  for (const endpoint of [first, second]) {
    let container = endpoint.parent;
    while (!seenContainers.has(container)) {
      seenContainers.add(container);
      result.push(...(graph.containers.get(container) ?? []));
      if (container) result.push(...graph.projectedChildrenFor(container));
      if (!container) break;
      container = container.parent;
    }
  }
  return result;
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
