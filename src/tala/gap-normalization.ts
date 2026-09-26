import { IdealGapSize } from './placement-geometry.js';
import { nodeDelta } from './overlap.js';
import { TalaGraph, TalaNode } from './graph.js';
import { ordinaryPlacementEdgeLength } from './placement-edge-length.js';
import { wrapContainers } from './equidistance.js';
import { introducesOverlap, overlapPairs } from './alignment-shift.js';

type Axis = 'x' | 'y';
type Direction = 1 | -1;
const largeGapThreshold = 0.5;

/** Ordinary-container portion of placement.NormalizeGaps. */
export function normalizeGaps(graph: TalaGraph, excludedNodes: ReadonlySet<string> = new Set()): boolean {
  let changed = false;
  const containers = graph.nodes.filter((node) => node.isGroup)
    .sort((a, b) => depth(b) - depth(a) || graph.nodes.indexOf(b) - graph.nodes.indexOf(a));
  const scopes = containers.map((container) => graph.nodes.filter((node) => node.isDescendantOf(container)));
  scopes.push(graph.nodes);
  for (const scope of scopes) {
    for (const axis of ['x', 'y'] as const) {
      for (const direction of [1, -1] as const) {
        const ordered = [...scope].sort((a, b) => b.edges.length - a.edges.length
          || a.id.localeCompare(b.id));
        for (const node of ordered) {
          if (excludedNodes.has(node.id)) continue;
          changed = reduceGapToNeighbors(node, graph, axis, direction, true) || changed;
        }
      }
    }
  }
  graph.resetTurnCost();
  return changed;
}

function reduceGapToNeighbors(node: TalaNode, graph: TalaGraph, axis: Axis,
  direction: Direction, recoverSymmetry: boolean): boolean {
  if (!node.topLeft) return false;
  const adjacent = nearestConnectedAhead(node, axis, direction);
  if (!adjacent) return false;
  const connected = adjacent.connectedNodes([node, ...graph.nodes.filter((n) => n.fixedTopLeft)], graph);
  const sharedContainer = sharedAncestor(node, adjacent);
  const between = nearestBetween(connected, node, adjacent, sharedContainer, axis, direction);
  const ahead = between ?? adjacent;
  const candidate = ancestorInContainer(node, ahead.parent);
  if (!candidate) return false;
  const gap = direction === 1
    ? ahead.topLeft![axis] - end(candidate, axis)
    : candidate.topLeft![axis] - end(ahead, axis);
  if (gap <= largeGapThreshold * graph.cellSize) return false;
  const delta = (IdealGapSize - gap) * direction;
  if (delta === 0) return false;
  const baseline = ordinaryPlacementEdgeLength(graph, graph.turnCost(), false);
  const existingOverlaps = overlapPairs(graph);
  const original = geometrySnapshot(graph);
  moveConnected(connected, axis, delta);
  wrapContainers(graph);
  if (!validGeometry(graph) || introducesOverlap(graph, existingOverlaps)) {
    restore(original); return false;
  }
  const movedCost = ordinaryPlacementEdgeLength(graph, graph.turnCost(), false);
  if (recoverSymmetry) {
    const afterFirst = geometrySnapshot(graph);
    if (reduceGapToNeighbors(node, graph, axis, direction === 1 ? -1 : 1, false)) {
      const recoveredCost = ordinaryPlacementEdgeLength(graph, graph.turnCost(), false);
      if (recoveredCost < movedCost - 0.0001 && recoveredCost < baseline - 0.0001) return true;
    }
    restore(afterFirst);
  }
  if (movedCost < baseline - 0.0001) return true;
  restore(original);
  return false;
}

function nearestConnectedAhead(node: TalaNode, axis: Axis, direction: Direction): TalaNode | undefined {
  let nearest: TalaNode | undefined;
  for (const edge of node.edges) {
    const adjacent = node.adjacent(edge);
    if (!adjacent.topLeft) continue;
    if (direction === 1) {
      if (adjacent.topLeft[axis] < end(node, axis)) continue;
      if (!nearest || adjacent.topLeft[axis] < nearest.topLeft![axis]) nearest = adjacent;
    } else {
      if (end(adjacent, axis) > node.topLeft![axis]) continue;
      if (!nearest || end(adjacent, axis) > end(nearest, axis)) nearest = adjacent;
    }
  }
  return nearest;
}

function nearestBetween(nodes: readonly TalaNode[], behind: TalaNode, ahead: TalaNode,
  container: TalaNode | null, axis: Axis, direction: Direction): TalaNode | undefined {
  let nearest: TalaNode | undefined;
  for (const node of nodes) {
    if (node === behind || node === ahead || node.parent !== container || !node.topLeft) continue;
    if (!isBetween(node, behind, ahead, axis, direction)) continue;
    if (!nearest || (direction === 1
      ? node.topLeft[axis] < nearest.topLeft![axis]
      : end(node, axis) > end(nearest, axis))) nearest = node;
  }
  return nearest;
}

function isBetween(node: TalaNode, behind: TalaNode, ahead: TalaNode,
  axis: Axis, direction: Direction): boolean {
  const cross = axis === 'x' ? 'y' : 'x';
  const delta = nodeDelta(behind, node, behind.topLeft);
  if (end(node, cross) < behind.topLeft![cross] - delta
    || node.topLeft![cross] > end(behind, cross) + delta) return false;
  if (direction === -1) [behind, ahead] = [ahead, behind];
  return end(node, axis) >= end(behind, axis)
    && node.topLeft![axis] <= ahead.topLeft![axis];
}

function ancestorInContainer(node: TalaNode, container: TalaNode | null): TalaNode | undefined {
  let candidate: TalaNode | null = node;
  while (candidate && candidate.parent !== container) candidate = candidate.parent;
  return candidate ?? undefined;
}

function moveConnected(nodes: readonly TalaNode[], axis: Axis, delta: number): void {
  const seen = new Set<TalaNode>();
  for (const node of nodes) {
    if (seen.has(node)) continue;
    seen.add(node);
    if (node.topLeft) node.topLeft = { ...node.topLeft,
      [axis]: node.topLeft[axis] + delta };
  }
}

function geometrySnapshot(graph: TalaGraph): Array<{ node: TalaNode; x: number; y: number;
  width: number; height: number }> {
  return graph.nodes.map((node) => ({ node, x: node.topLeft!.x, y: node.topLeft!.y,
    width: node.width, height: node.height }));
}

function restore(snapshot: ReturnType<typeof geometrySnapshot>): void {
  for (const { node, x, y, width, height } of snapshot) {
    node.topLeft = { x, y }; node.width = width; node.height = height;
  }
}

function validGeometry(graph: TalaGraph): boolean {
  for (let i = 0; i < graph.nodes.length - 1; i++) for (let j = i + 1; j < graph.nodes.length; j++) {
    const a = graph.nodes[i]!, b = graph.nodes[j]!;
    if (a.parent !== b.parent || !a.topLeft || !b.topLeft) continue;
    if (a.topLeft.x < b.topLeft.x + b.width && a.topLeft.x + a.width > b.topLeft.x
      && a.topLeft.y < b.topLeft.y + b.height && a.topLeft.y + a.height > b.topLeft.y) return false;
  }
  return true;
}

function sharedAncestor(first: TalaNode, second: TalaNode): TalaNode | null {
  const ancestors = new Set<TalaNode>();
  for (let current = first.parent; current; current = current.parent) ancestors.add(current);
  for (let current = second.parent; current; current = current.parent) if (ancestors.has(current)) return current;
  return null;
}
function depth(node: TalaNode): number {
  let result = 0;
  for (let current = node.parent; current; current = current.parent) result++;
  return result;
}
function end(node: TalaNode, axis: Axis): number {
  return node.topLeft![axis] + (axis === 'x' ? node.width : node.height);
}
