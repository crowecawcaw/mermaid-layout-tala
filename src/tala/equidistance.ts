import { ContainerPadding } from './geometry-policy.js';
import { TalaGraph, TalaNode } from './graph.js';
import { ordinaryPlacementEdgeLength } from './placement-edge-length.js';
import { sizedOrientation } from './placement-geometry.js';

type Axis = 'x' | 'y';
const precision = 0.0001;

/** Port of the ordinary-container branch of placement.Equidistance. */
export function equidistance(graph: TalaGraph): boolean {
  let horizontal = false, vertical = false;
  for (const node of graph.nodes) {
    horizontal = equidistanceNode(node, graph, 'x') || horizontal;
    vertical = equidistanceNode(node, graph, 'y') || vertical;
  }
  for (const axis of ['x', 'y'] as const) {
    if (!(axis === 'x' ? horizontal : vertical)) continue;
    for (let pass = 0; pass < 5; pass++) {
      let moved = false;
      for (const node of graph.nodes) moved = equidistanceNode(node, graph, axis) || moved;
      if (!moved) break;
    }
  }
  return horizontal || vertical;
}

function equidistanceNode(original: TalaNode, graph: TalaGraph, axis: Axis): boolean {
  if (!original.topLeft || original.fixedTopLeft) return false;
  let back: TalaNode | undefined, front: TalaNode | undefined;
  for (const edge of original.edges) {
    const adjacent = original.adjacent(edge);
    if (!adjacent.topLeft || original.isDescendantOf(adjacent)
      || adjacent.isDescendantOf(original)) return false;
    if (end(adjacent, axis) < original.topLeft[axis]) {
      if (!back || end(adjacent, axis) > end(back, axis)) back = adjacent;
    }
    if (adjacent.topLeft[axis] > end(original, axis)) {
      if (!front || adjacent.topLeft[axis] < front.topLeft![axis]) front = adjacent;
    }
  }
  if (!back || !front) return false;

  const extra = reachableSideBranches(original, back, front, graph, axis);
  if (extra.some((node) => node.fixedTopLeft)) extra.length = 0;
  let nearestBack: TalaNode = back, nearestFront: TalaNode = front;
  let node = original;
  while (node.parent && !nearestBack.isDescendantOf(node.parent)
    && !nearestFront.isDescendantOf(node.parent)) node = node.parent;
  const ancestorBack = sharedAncestor(original, back);
  const ancestorFront = sharedAncestor(original, front);
  while (nearestBack.parent && nearestBack.parent !== ancestorBack) {
    const parent: TalaNode = nearestBack.parent;
    if (end(parent, axis) >= node.topLeft![axis]) break;
    nearestBack = parent;
  }
  while (nearestFront.parent && nearestFront.parent !== ancestorFront) {
    const parent: TalaNode = nearestFront.parent;
    if (parent.topLeft![axis] <= end(node, axis)) break;
    nearestFront = parent;
  }

  const midpoint = (end(nearestBack, axis) + nearestFront.topLeft![axis]) / 2;
  const delta = goRound(midpoint - size(node, axis) / 2) - node.topLeft![axis];
  if (Math.abs(delta) < precision) return false;
  const baseline = ordinaryPlacementEdgeLength(graph);
  const solo = trialMove(graph, [node], axis, delta, baseline);
  const together = extra.length ? trialMove(graph, [...extra, node], axis, delta, baseline) : undefined;
  if (solo === undefined && together === undefined) return false;
  const choice = solo === undefined ? [...extra, node]
    : together === undefined || solo < together - precision ? [node] : [...extra, node];
  translateWithChildren(choice, axis, delta);
  wrapContainers(graph);
  return true;
}

function trialMove(graph: TalaGraph, nodes: readonly TalaNode[], axis: Axis,
  delta: number, baseline: number): number | undefined {
  const before = graph.nodes.map((node) => ({ node, topLeft: node.topLeft
    ? { ...node.topLeft } : undefined, width: node.width, height: node.height }));
  translateWithChildren(nodes, axis, delta);
  wrapContainers(graph);
  const cost = validGeometry(graph) ? ordinaryPlacementEdgeLength(graph) : Infinity;
  for (const old of before) {
    old.node.topLeft = old.topLeft;
    old.node.width = old.width;
    old.node.height = old.height;
  }
  return Number.isFinite(cost) && cost <= baseline + precision ? cost : undefined;
}

function translateWithChildren(nodes: readonly TalaNode[], axis: Axis, delta: number): void {
  // Go moves each requested node with its children in order. If a child and
  // its container are both requested, that child receives both moves.
  const move = (node: TalaNode): void => {
    if (node.topLeft) node.topLeft = { ...node.topLeft,
      [axis]: node.topLeft[axis] + delta };
    for (const child of node.children) move(child);
  };
  for (const node of nodes) move(node);
}

/** Ordinary rectangular branch of layoutgraph.Node.wrapChildren. */
export function wrapContainers(graph: TalaGraph): void {
  const containers = graph.nodes.filter((node) => node.isGroup && node.children.length > 0)
    .sort((a, b) => depth(b) - depth(a));
  for (const group of containers) {
    const children = group.children.filter((child) => child.topLeft);
    if (!children.length) continue;
    const left = Math.min(...children.map((child) => child.topLeft!.x));
    const top = Math.min(...children.map((child) => child.topLeft!.y));
    const right = Math.max(...children.map((child) => child.topLeft!.x + child.width));
    const bottom = Math.max(...children.map((child) => child.topLeft!.y + child.height));
    const width = Math.max(right - left + 2 * ContainerPadding, group.desiredWidth ?? 0);
    const topPadding = Math.max(ContainerPadding, (group.labelBBox?.height ?? 0) + 28);
    const height = Math.max(bottom - top + topPadding + ContainerPadding,
      group.desiredHeight ?? 0);
    group.width = width;
    group.height = height;
    group.topLeft = { x: left - (width - (right - left)) / 2, y: top - topPadding };
  }
}

function reachableSideBranches(node: TalaNode, back: TalaNode, front: TalaNode,
  graph: TalaGraph, axis: Axis): TalaNode[] {
  const excluded = new Set([node, back, front]);
  const result: TalaNode[] = [];
  const seen = new Set<TalaNode>();
  for (const edge of node.edges) {
    const adjacent = node.adjacent(edge);
    if (excluded.has(adjacent) || !adjacent.topLeft) continue;
    const orientation = sizedOrientation(adjacent, node);
    if (axis === 'x' ? orientation !== 'Top' && orientation !== 'Bottom'
      : orientation !== 'Left' && orientation !== 'Right') continue;
    for (const reached of adjacent.connectedNodes([...excluded], graph)) {
      if (!seen.has(reached)) { seen.add(reached); result.push(reached); }
    }
  }
  return result;
}

function validGeometry(graph: TalaGraph): boolean {
  for (let i = 0; i < graph.nodes.length - 1; i++) {
    const first = graph.nodes[i]!;
    if (!first.topLeft) continue;
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const second = graph.nodes[j]!;
      if (!second.topLeft || first.parent !== second.parent) continue;
      if (first.topLeft.x < second.topLeft.x + second.width
        && first.topLeft.x + first.width > second.topLeft.x
        && first.topLeft.y < second.topLeft.y + second.height
        && first.topLeft.y + first.height > second.topLeft.y) return false;
    }
  }
  return true;
}

function sharedAncestor(first: TalaNode, second: TalaNode): TalaNode | null {
  const ancestors = new Set<TalaNode>();
  for (let current = first.parent; current; current = current.parent) ancestors.add(current);
  for (let current = second.parent; current; current = current.parent) {
    if (ancestors.has(current)) return current;
  }
  return null;
}

function depth(node: TalaNode): number {
  let count = 0;
  for (let current = node.parent; current; current = current.parent) count++;
  return count;
}

function size(node: TalaNode, axis: Axis): number { return axis === 'x' ? node.width : node.height; }
function end(node: TalaNode, axis: Axis): number { return node.topLeft![axis] + size(node, axis); }
function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
