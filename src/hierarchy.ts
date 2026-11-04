// Hierarchy ordering and alignment adapted from D2 TALA, commit bf337903.
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0

export interface HierarchyNode {
  id: string;
  level: number;
  rank: number;
  width: number;
  x: number;
  dummy: boolean;
  degree: number;
  above: Set<HierarchyNode>;
  below: Set<HierarchyNode>;
  leftPad: number;
  rightPad: number;
}
export type Layers = HierarchyNode[][];
export function hierarchyNode(id: string, level: number, width: number, dummy = false): HierarchyNode {
  return { id, level, width, dummy, rank: 0, x: 0, degree: 0, above: new Set(), below: new Set(), leftPad: 0, rightPad: 0 };
}
export function connectHierarchy(a: HierarchyNode, b: HierarchyNode): void {
  if (a.level === b.level) return;
  if (a.level > b.level) [a, b] = [b, a];
  a.below.add(b); b.above.add(a);
}
export function initializeRanks(layers: Layers): void {
  for (const layer of layers) layer.forEach((node, rank) => { node.rank = rank; });
}
export function breakLongConnections(nodes: HierarchyNode[], layers: Layers): HierarchyNode[] {
  const dummies: HierarchyNode[] = [];
  for (const node of nodes) {
    const below = [...node.below].filter((n) => n.level - node.level > 1)
      .sort((a, b) => a.rank - b.rank || a.level - b.level);
    for (const target of below) {
      node.below.delete(target); target.above.delete(node);
      let previous = node;
      for (let level = node.level + 1; level < target.level; level++) {
        // Identity is internal; dummy nodes are never entered in the public ID map.
        const dummy = hierarchyNode(`dummy:${dummies.length}`, level, 1, true);
        dummy.degree = 2; dummy.rank = layers[level]!.length;
        layers[level]!.push(dummy); dummies.push(dummy);
        connectHierarchy(previous, dummy); previous = dummy;
      }
      connectHierarchy(previous, target);
    }
  }
  return dummies;
}

type Segment = { a: HierarchyNode; b: HierarchyNode };
function segments(nodes: HierarchyNode[]): Segment[] {
  return nodes.flatMap((a) => [...a.above, ...a.below].map((b) => ({ a, b })))
    .sort((u, v) => u.a.rank - v.a.rank || u.b.rank - v.b.rank);
}
function equal(a: HierarchyNode, b: HierarchyNode): boolean { return a.rank === b.rank && a.level === b.level; }
export function crossingScore(nodes: HierarchyNode[]): { crossings: number; length: number } {
  const links = segments(nodes);
  let crossings = 0, length = 0;
  for (let i = 0; i < links.length; i++) {
    const { a, b } = links[i]!;
    length += Math.hypot(b.rank - a.rank, b.level - a.level);
    for (let j = i + 1; j < links.length; j++) {
      const { a: c, b: d } = links[j]!;
      if (equal(a, c) || equal(b, d)) continue;
      const denominator = (b.level - a.level) * (d.rank - c.rank) - (b.rank - a.rank) * (d.level - c.level);
      if (denominator === 0) continue;
      const s = ((d.rank - c.rank) * (c.level - a.level) - (d.level - c.level) * (c.rank - a.rank)) / denominator;
      const t = ((b.rank - a.rank) * (c.level - a.level) - (b.level - a.level) * (c.rank - a.rank)) / denominator;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) crossings++;
    }
  }
  return { crossings, length };
}
function better(a: ReturnType<typeof crossingScore>, b: ReturnType<typeof crossingScore>): boolean {
  return a.crossings < b.crossings || (a.crossings === b.crossings && a.length < b.length - 0.0001);
}
function swap(layer: HierarchyNode[], i: number, j: number): void {
  [layer[i], layer[j]] = [layer[j]!, layer[i]!];
  layer.forEach((node, rank) => { node.rank = rank; });
}
export function minimizeCrossings(layers: Layers, passes = Math.max(0, ...layers.map((layer) => layer.length))): void {
  for (let pass = 0; pass < passes; pass++) {
    for (let level = 0; level < layers.length; level++) {
      const layer = layers[level]!;
      if (!layer.length) continue;
      const average = (node: HierarchyNode) => {
        const neighbors = [...(level > 0 ? node.above : node.below)];
        return neighbors.length ? neighbors.reduce((sum, n) => sum + n.rank, 0) / neighbors.length : 0;
      };
      layer.sort((a, b) => average(a) - average(b));
      layer.forEach((node, rank) => { node.rank = rank; });
      let score = crossingScore(layer);
      for (let i = 0; i < layer.length; i++) {
        let best = { crossings: Infinity, length: Infinity }, bestIndex = 0;
        for (let k = i + 1; k < i + 4; k++) {
          const j = k % layer.length;
          swap(layer, i, j);
          const candidate = crossingScore(layer);
          if (better(candidate, best)) { best = candidate; bestIndex = j; }
          swap(layer, j, i);
        }
        if (better(best, score)) { swap(layer, i, bestIndex); score = best; }
      }
    }
  }
}
export function globalSifting(layers: Layers): void {
  const queue = layers.flat().sort((a, b) => b.degree - a.degree || a.level - b.level || a.rank - b.rank);
  let allowEqual = false;
  for (let iteration = 0; iteration < 10; iteration++) {
    let changed = false;
    for (const node of queue) {
      const layer = layers[node.level]!;
      const oldRank = node.rank;
      let best = crossingScore(layer), bestIndex = oldRank;
      if (best.crossings === 0 || layer.length === 1) continue;
      const consider = (index: number) => {
        const candidate = crossingScore(layer);
        if ((allowEqual && candidate.crossings <= best.crossings) || better(candidate, best)) {
          best = candidate; bestIndex = index;
        }
      };
      for (let i = oldRank; i < layer.length - 1; i++) { swap(layer, i, i + 1); consider(i + 1); }
      for (let i = layer.length - 1; i > 0; i--) { swap(layer, i, i - 1); consider(i - 1); }
      for (let i = 0; i < bestIndex; i++) swap(layer, i, i + 1);
      if (node.rank !== oldRank) changed = true;
    }
    if (!changed && allowEqual) break;
    allowEqual = !changed;
  }
}

export function markConflicts(layers: Layers): Map<HierarchyNode, Set<HierarchyNode>> {
  const conflicts = new Map<HierarchyNode, Set<HierarchyNode>>();
  const add = (a: HierarchyNode, b: HierarchyNode) => {
    if (!conflicts.has(a)) conflicts.set(a, new Set());
    conflicts.get(a)!.add(b);
  };
  for (let level = 1; level < layers.length - 1; level++) {
    let k0 = 0, cursor = 0;
    const next = layers[level + 1]!;
    for (let i = 0; i < next.length; i++) {
      const node = next[i]!;
      let k1 = 0;
      if (i === next.length - 1) k1 = layers[level]!.at(-1)?.rank ?? 0;
      else if (node.dummy) {
        for (const above of node.above) if (above.dummy) k1 = above.rank;
      } else continue;
      for (; cursor <= i; cursor++) {
        const n = next[cursor]!;
        for (const above of n.above) if (above.rank < k0 || above.rank > k1) { add(n, above); add(above, n); }
      }
      k0 = k1;
    }
  }
  return conflicts;
}
export interface AlignmentNode {
  node: HierarchyNode;
  previous: AlignmentNode | undefined;
  root: AlignmentNode;
  aligned: AlignmentNode;
  sink: AlignmentNode;
  medians: AlignmentNode[];
  x: number;
  shift: number;
  blockSize: number;
  leftPad: number;
  rightPad: number;
}
export function createAlignmentNodes(layers: Layers, bottom: boolean, right: boolean): AlignmentNode[] {
  const map = new Map<HierarchyNode, AlignmentNode>();
  for (const node of layers.flat()) {
    const n = { node, previous: undefined, medians: [], x: right ? Infinity : -Infinity,
      shift: right ? -Infinity : Infinity, blockSize: node.width, leftPad: node.leftPad, rightPad: node.rightPad } as unknown as AlignmentNode;
    n.root = n; n.aligned = n; n.sink = n; map.set(node, n);
  }
  const nodes = [...map.values()].sort((a, b) => (bottom ? -1 : 1) * (a.node.level - b.node.level)
    || (right ? -1 : 1) * (a.node.rank - b.node.rank));
  let previous: AlignmentNode | undefined;
  for (const n of nodes) {
    if (previous?.node.level !== n.node.level) previous = undefined;
    n.previous = previous; previous = n;
    const neighbors = [...(bottom ? n.node.below : n.node.above)]
      .filter((other) => other.level === n.node.level + (bottom ? 1 : -1))
      .sort((a, b) => a.x - b.x).map((other) => map.get(other)!);
    if (neighbors.length % 2) n.medians = [neighbors[Math.floor(neighbors.length / 2)]!];
    else if (neighbors.length) {
      n.medians = [neighbors[neighbors.length / 2 - 1]!, neighbors[neighbors.length / 2]!];
      if (right) n.medians.reverse();
    }
  }
  return nodes;
}
export function verticalAlignment(nodes: AlignmentNode[], conflicts: ReturnType<typeof markConflicts>, right: boolean): void {
  let last = Infinity;
  for (const n of nodes) {
    if (!n.previous) last = right ? Infinity : -Infinity;
    for (const m of n.medians) {
      if (conflicts.get(n.node)?.has(m.node) || n.aligned !== n || (right ? last <= m.node.rank : last >= m.node.rank)) continue;
      m.aligned = n; n.root = m.root; n.aligned = n.root;
      m.root.blockSize = Math.max(m.root.blockSize, n.blockSize);
      m.root.leftPad = Math.max(m.root.leftPad, n.leftPad);
      m.root.rightPad = Math.max(m.root.rightPad, n.rightPad);
      last = m.node.rank;
    }
  }
}
export function horizontalCompaction(nodes: AlignmentNode[], right: boolean, spacing = 60, dummySpacing = 50): void {
  const placeBlock = (root: AlignmentNode) => {
    if (Number.isFinite(root.x)) return;
    root.x = 0;
    let n = root;
    do {
      if (n.previous) {
        const prev = n.previous.root;
        placeBlock(prev);
        if (root.sink === root) root.sink = prev.sink;
        const delta = (root.node.dummy || root.previous?.node.dummy ? dummySpacing : spacing)
          + (right ? prev.leftPad + root.rightPad : prev.rightPad + root.leftPad);
        if (root.sink !== prev.sink) {
          prev.sink.shift = right ? Math.max(prev.sink.shift, root.x - prev.x + root.blockSize + delta)
            : Math.min(prev.sink.shift, root.x - prev.x - prev.blockSize - delta);
        } else {
          root.x = right ? Math.min(root.x, prev.x - root.blockSize - delta) : Math.max(root.x, prev.x + prev.blockSize + delta);
        }
      }
      n = n.aligned;
    } while (n !== root);
  };
  for (const n of nodes) if (n.root === n) placeBlock(n);
  for (const n of nodes) {
    n.x = n.root.x;
    if (n.root === n && Number.isFinite(n.sink.shift)) n.x += n.sink.shift;
  }
}
const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);
export function alignHierarchy(layers: Layers, spacing = 60, dummySpacing = 50): Map<HierarchyNode, number> {
  if (!layers.flat().length) return new Map();
  const conflicts = markConflicts(layers);
  const attempts = [[false, false], [false, true], [true, false], [true, true]].map(([bottom, right]) => {
    const nodes = createAlignmentNodes(layers, bottom!, right!);
    verticalAlignment(nodes, conflicts, right!);
    horizontalCompaction(nodes, right!, spacing, dummySpacing);
    return { right: right!, nodes, min: Math.min(...nodes.map((n) => n.x)), max: Math.max(...nodes.map((n) => n.x + n.blockSize)) };
  });
  const narrowest = attempts.reduce((best, attempt) => attempt.max - attempt.min < best.max - best.min ? attempt : best);
  const coordinates = new Map<HierarchyNode, number[]>();
  for (const attempt of attempts) {
    const shift = attempt.right ? narrowest.max - attempt.max : narrowest.min - attempt.min;
    for (const n of attempt.nodes) {
      const values = coordinates.get(n.node) ?? [];
      values.push(n.x + n.root.blockSize / 2 - n.node.width / 2 + shift);
      coordinates.set(n.node, values);
    }
  }
  return new Map([...coordinates].map(([node, values]) => {
    values.sort((a, b) => a - b);
    return [node, goRound(values[1]! / 2 + values[2]! / 2)];
  }));
}
