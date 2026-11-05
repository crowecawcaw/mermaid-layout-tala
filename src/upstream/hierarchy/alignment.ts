// Translated from internal/hierarchy/brandes_kopf.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import {
  containerPadding,
  wrapChildren,
} from '../layoutgraph/node-geometry.js';
import { ContainerPadding } from '../layoutgraph/geometry-policy.js';
import { Orientation as O } from '../geo/orientation.js';
import { Round } from '../geo/math.js';
import { PlacementNode } from './placement-nodes.js';
export class AlignmentNode {
  prevSibling: AlignmentNode | null = null;
  root: AlignmentNode = this;
  alignedWith: AlignmentNode = this;
  sink: AlignmentNode = this;
  medianNeighbors: AlignmentNode[] = [];
  shift = 0;
  x = 0;
  blockSize: number;
  rightPad = 0;
  leftPad = 0;
  constructor(public placementNode: PlacementNode) {
    this.blockSize = placementNode.graphNode!.Width;
  }
  get level(): number {
    return this.placementNode.level;
  }
  get rank(): number {
    return this.placementNode.rank;
  }
}
export function median(numbers: number[]): number {
  if (!numbers.length) return 0;
  if (numbers.length === 1) return numbers[0]!;
  const ordered = [...numbers].sort((a, b) => a - b),
    mid = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[mid]!
    : ordered[mid - 1]! / 2 + ordered[mid]! / 2;
}
function padding(node: PlacementNode) {
  if (!node || node.isDummy)
    return { left: ContainerPadding, right: ContainerPadding };
  return containerPadding(
    node.graphNode!.Graph!,
    node.container?.graphNode ?? null,
    true,
  );
}
export function leafNodesContext(
  nodes: PlacementNode[],
  guard: WorkGuard,
): AlignmentNode[] {
  const leaves: AlignmentNode[] = [];
  for (const node of nodes) {
    guard.Step();
    if (!node.isContainer) {
      leaves.push(new AlignmentNode(node));
      continue;
    }
    const descendants = leafNodesContext(node.children, guard);
    const pick = (endpoint: PlacementNode) => {
      let best = descendants[0]!,
        diff = Math.abs(endpoint.rank - best.placementNode.rank);
      for (const candidate of descendants) {
        guard.Step();
        const d = Math.abs(endpoint.rank - candidate.placementNode.rank);
        if (d < diff) {
          diff = d;
          best = candidate;
        }
      }
      return best;
    };
    for (const above of node.aboves) {
      guard.Step();
      above.belows.delete(node);
      const child = pick(above);
      above.belows.add(child.placementNode);
      child.placementNode.aboves.add(above);
    }
    for (const below of node.belows) {
      guard.Step();
      below.aboves.delete(node);
      const child = pick(below);
      below.aboves.add(child.placementNode);
      child.placementNode.belows.add(below);
    }
    leaves.push(...descendants);
  }
  const left = leaves[0]!,
    right = leaves[leaves.length - 1]!;
  left.leftPad += padding(left.placementNode).left;
  right.rightPad += padding(right.placementNode).right;
  return leaves;
}
export function createAlignmentNodes(
  ctx: Context,
  byLevel: Map<number, PlacementNode[]>,
  vertical: O,
  horizontal: O,
): AlignmentNode[] {
  const guard = new WorkGuard(ctx, 'CreateAlignmentNodes', MaxEngineWorkUnits),
    mapping = new Map<PlacementNode, AlignmentNode>(),
    nodes: AlignmentNode[] = [];
  for (let level = 0; level < byLevel.size; level++) {
    guard.Step();
    for (const node of leafNodesContext(byLevel.get(level)!, guard)) {
      guard.Step();
      nodes.push(node);
      mapping.set(node.placementNode, node);
    }
  }
  nodes.sort(
    (a, b) =>
      (vertical === O.Top ? a.level - b.level : b.level - a.level) ||
      (horizontal === O.Left ? a.rank - b.rank : b.rank - a.rank),
  );
  guard.Finish();
  const x = horizontal === O.Right ? Infinity : -Infinity,
    shift = horizontal === O.Right ? -Infinity : Infinity;
  let previous: AlignmentNode | null = null;
  for (const node of nodes) {
    guard.Step();
    if (previous && node.level !== previous.level) previous = null;
    const neighbors: AlignmentNode[] = [],
      connections =
        vertical === O.Top
          ? node.placementNode.aboves
          : node.placementNode.belows;
    for (const neighbor of connections) {
      guard.Step();
      if (neighbor.level === node.level + (vertical === O.Top ? -1 : 1))
        neighbors.push(mapping.get(neighbor)!);
    }
    if (neighbors.length) {
      neighbors.sort(
        (a, b) =>
          a.placementNode.graphNode!.TopLeft!.X -
          b.placementNode.graphNode!.TopLeft!.X,
      );
      const mid = (neighbors.length + 1) / 2;
      if (neighbors.length % 2)
        node.medianNeighbors = [neighbors[Math.trunc(mid) - 1]!];
      else {
        let left = Math.floor(mid) - 1,
          right = Math.ceil(mid) - 1;
        if (horizontal === O.Right) [left, right] = [right, left];
        node.medianNeighbors = [neighbors[left]!, neighbors[right]!];
      }
    }
    node.prevSibling = previous;
    node.x = x;
    node.shift = shift;
    previous = node;
  }
  guard.Finish();
  return nodes;
}
export function markConflicts(
  ctx: Context,
  byLevel: Map<number, PlacementNode[]>,
): Map<PlacementNode, Set<PlacementNode>> {
  const guard = new WorkGuard(
      ctx,
      'MarkHierarchyConflicts',
      MaxEngineWorkUnits,
    ),
    conflicts = new Map<PlacementNode, Set<PlacementNode>>();
  const add = (a: PlacementNode, b: PlacementNode) => {
    let list = conflicts.get(a);
    if (!list) {
      list = new Set();
      conflicts.set(a, list);
    }
    list.add(b);
  };
  for (let level = 1; level < byLevel.size - 1; level++) {
    guard.Step();
    const current = byLevel.get(level)!,
      next = byLevel.get(level + 1)!;
    let k0 = 0,
      l = 0;
    for (let l1 = 0; l1 < next.length; l1++) {
      guard.Step();
      const pn = next[l1]!;
      let k1 = 0;
      if (l1 === next.length - 1) k1 = current[current.length - 1]!.rank;
      else if (pn.isDummy) {
        for (const above of pn.aboves) {
          guard.Step();
          if (above.isDummy) k1 = above.rank;
        }
      } else continue;
      for (; l <= l1; l++) {
        guard.Step();
        for (const above of next[l]!.aboves) {
          guard.Step();
          if (above.rank < k0 || above.rank > k1) {
            add(next[l]!, above);
            add(above, next[l]!);
          }
        }
      }
      k0 = k1;
    }
  }
  guard.Finish();
  return conflicts;
}
export function verticalAlignment(
  ctx: Context,
  nodes: AlignmentNode[],
  conflicts: Map<PlacementNode, Set<PlacementNode>>,
  horizontal: O,
): void {
  const guard = new WorkGuard(ctx, 'VerticalAlignment', MaxEngineWorkUnits);
  let last = Number.MAX_SAFE_INTEGER;
  for (const n of nodes) {
    guard.Step();
    if (!n.prevSibling)
      last =
        horizontal === O.Left
          ? Number.MIN_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
    for (const m of n.medianNeighbors) {
      guard.Step();
      if (
        conflicts.get(n.placementNode)?.has(m.placementNode) ||
        n.alignedWith !== n ||
        (horizontal === O.Left && last >= m.rank) ||
        (horizontal === O.Right && last <= m.rank)
      )
        continue;
      m.alignedWith = n;
      n.root = m.root;
      n.alignedWith = n.root;
      m.root.blockSize = Math.max(m.root.blockSize, n.blockSize);
      m.root.leftPad = Math.max(m.root.leftPad, n.leftPad);
      m.root.rightPad = Math.max(m.root.rightPad, n.rightPad);
      last = m.rank;
    }
  }
  guard.Finish();
}
export function distanceFromPreviousRoot(
  previous: AlignmentNode,
  current: AlignmentNode,
  horizontal: O,
): number {
  let pad =
    current.placementNode.isDummy || current.prevSibling?.placementNode.isDummy
      ? 50
      : 60;
  if (horizontal === O.Left) pad += previous.rightPad + current.leftPad;
  else pad += previous.leftPad + current.rightPad;
  return pad;
}
export function placeBlock(
  root: AlignmentNode,
  horizontal: O,
  guard: WorkGuard,
): void {
  guard.Step();
  if (Number.isFinite(root.x)) return;
  root.x = 0;
  let n = root;
  for (;;) {
    guard.Step();
    if (n.prevSibling) {
      const prev = n.prevSibling.root;
      placeBlock(prev, horizontal, guard);
      if (root.sink === root) root.sink = prev.sink;
      const delta = distanceFromPreviousRoot(prev, root, horizontal);
      if (root.sink !== prev.sink) {
        if (horizontal === O.Left)
          prev.sink.shift = Math.min(
            prev.sink.shift,
            root.x - prev.x - prev.blockSize - delta,
          );
        else
          prev.sink.shift = Math.max(
            prev.sink.shift,
            root.x - prev.x + root.blockSize + delta,
          );
      } else if (horizontal === O.Left)
        root.x = Math.max(root.x, prev.x + prev.blockSize + delta);
      else root.x = Math.min(root.x, prev.x - root.blockSize - delta);
    }
    n = n.alignedWith;
    if (n === root) break;
  }
}
export function horizontalCompaction(
  ctx: Context,
  nodes: AlignmentNode[],
  horizontal: O,
): void {
  const guard = new WorkGuard(ctx, 'HorizontalCompaction', MaxEngineWorkUnits);
  for (const n of nodes) {
    guard.Step();
    if (n.root === n) placeBlock(n, horizontal, guard);
  }
  for (const n of nodes) {
    guard.Step();
    n.x = n.root.x;
    if (n.root === n && Number.isFinite(n.sink.shift)) n.x += n.sink.shift;
  }
  guard.Finish();
}
export function syncContainers(g: Graph, guard: WorkGuard): void {
  const containers = [] as import('../layoutgraph/node.js').Node[],
    queue = [...g.Nodes];
  for (let i = 0; i < queue.length; i++) {
    guard.Step();
    const node = queue[i]!;
    if (node.isContainer) {
      containers.push(node);
      queue.push(...(g.Containers.get(node) ?? []));
    }
  }
  for (let i = containers.length - 1; i >= 0; i--) {
    guard.Step();
    wrapChildren(containers[i]!);
  }
  guard.Finish();
}
export function alignHierarchy(
  ctx: Context,
  g: Graph,
  byLevel: Map<number, PlacementNode[]>,
): void {
  const guard = new WorkGuard(ctx, 'AlignHierarchy', MaxEngineWorkUnits),
    directions = [
      [O.Top, O.Left],
      [O.Top, O.Right],
      [O.Bottom, O.Left],
      [O.Bottom, O.Right],
    ] as const,
    conflicts = markConflicts(ctx, byLevel),
    mins: number[] = [],
    maxs: number[] = [],
    xs = new Map<PlacementNode, number[]>();
  let width = Infinity,
    best = 0;
  for (let i = 0; i < directions.length; i++) {
    guard.Step();
    const [vertical, horizontal] = directions[i]!,
      nodes = createAlignmentNodes(ctx, byLevel, vertical, horizontal);
    verticalAlignment(ctx, nodes, conflicts, horizontal);
    horizontalCompaction(ctx, nodes, horizontal);
    let min = Infinity,
      max = -Infinity;
    for (const node of nodes) {
      guard.Step();
      const x =
          node.x +
          node.root.blockSize / 2 -
          node.placementNode.graphNode!.Width / 2,
        list = xs.get(node.placementNode) ?? [];
      list.push(x);
      xs.set(node.placementNode, list);
      min = Math.min(min, node.x);
      max = Math.max(max, node.x + node.blockSize);
    }
    mins.push(min);
    maxs.push(max);
    if (max - min < width) {
      width = max - min;
      best = i;
    }
  }
  const shifts: number[] = [];
  for (let i = 0; i < directions.length; i++) {
    guard.Step();
    shifts.push(
      directions[i]![1] === O.Left
        ? mins[best]! - mins[i]!
        : maxs[best]! - maxs[i]!,
    );
  }
  const updates: [PlacementNode, number][] = [];
  for (const [pn, positions] of xs) {
    guard.Step();
    for (let i = 0; i < positions.length; i++) {
      guard.Step();
      positions[i]! += shifts[i]!;
    }
    updates.push([pn, Round(median(positions))]);
  }
  guard.Finish();
  for (const [pn, x] of updates) pn.graphNode!.TopLeft!.X = x;
  syncContainers(g, guard);
}
