import type { HierarchyVertex } from './hierarchy-flat.js';

/** Flat-node translation of hierarchy/brandes_kopf.go. */
type Vertical = 'Top' | 'Bottom';
type Horizontal = 'Left' | 'Right';
interface Direction { vertical: Vertical; horizontal: Horizontal }
interface AlignmentNode {
  vertex: HierarchyVertex;
  prevSibling: AlignmentNode | undefined;
  root: AlignmentNode;
  alignedWith: AlignmentNode;
  sink: AlignmentNode;
  medianNeighbors: AlignmentNode[];
  shift: number;
  x: number;
  blockSize: number;
  leftPad: number;
  rightPad: number;
}
const siblingSpacing = 60;
const siblingDummySpacing = 50;
const containerPadding = 60;

export function alignFlatHierarchy(byLevel: HierarchyVertex[][]): void {
  const directions: Direction[] = [
    { vertical: 'Top', horizontal: 'Left' },
    { vertical: 'Top', horizontal: 'Right' },
    { vertical: 'Bottom', horizontal: 'Left' },
    { vertical: 'Bottom', horizontal: 'Right' },
  ];
  const conflicts = markConflicts(byLevel);
  const xValues = new Map<HierarchyVertex, number[]>();
  const extents: Array<{ min: number; max: number }> = [];
  let narrowest = 0, narrowestWidth = Infinity;
  directions.forEach((direction, index) => {
    const nodes = createAlignmentNodes(byLevel, direction);
    verticalAlignment(nodes, conflicts, direction.horizontal);
    horizontalCompaction(nodes, direction.horizontal);
    let min = Infinity, max = -Infinity;
    for (const node of nodes) {
      const vertex = node.vertex;
      const x = node.x + node.root.blockSize / 2 - vertex.width / 2;
      const values = xValues.get(vertex) ?? [];
      values.push(x);
      xValues.set(vertex, values);
      min = Math.min(min, node.x);
      max = Math.max(max, node.x + node.blockSize);
    }
    extents.push({ min, max });
    if (max - min < narrowestWidth) { narrowestWidth = max - min; narrowest = index; }
  });
  for (const [vertex, values] of xValues) {
    for (let index = 0; index < values.length; index++) {
      const direction = directions[index]!;
      const shift = direction.horizontal === 'Left'
        ? extents[narrowest]!.min - extents[index]!.min
        : extents[narrowest]!.max - extents[index]!.max;
      values[index]! += shift;
    }
    values.sort((a, b) => a - b);
    const x = values.length % 2 === 1 ? values[Math.floor(values.length / 2)]!
      : (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2;
    vertex.topLeft.x = roundAway(x);
  }
}

function makeNode(vertex: HierarchyVertex): AlignmentNode {
  const node = {} as AlignmentNode;
  node.vertex = vertex;
  node.root = node;
  node.alignedWith = node;
  node.sink = node;
  node.medianNeighbors = [];
  node.prevSibling = undefined;
  node.shift = 0;
  node.x = 0;
  node.blockSize = vertex.width;
  node.leftPad = 0;
  node.rightPad = 0;
  return node;
}

function createAlignmentNodes(byLevel: HierarchyVertex[][], direction: Direction): AlignmentNode[] {
  const map = new Map<HierarchyVertex, AlignmentNode>();
  const nodes: AlignmentNode[] = [];
  for (const row of byLevel) {
    const local = row.map(makeNode);
    if (local.length) {
      local[0]!.leftPad += containerPadding;
      local.at(-1)!.rightPad += containerPadding;
    }
    for (const node of local) { map.set(node.vertex, node); nodes.push(node); }
  }
  nodes.sort((a, b) => (direction.vertical === 'Top'
    ? a.vertex.level - b.vertex.level : b.vertex.level - a.vertex.level)
    || (direction.horizontal === 'Left'
      ? a.vertex.rank - b.vertex.rank : b.vertex.rank - a.vertex.rank));
  const initialX = direction.horizontal === 'Left' ? -Infinity : Infinity;
  const initialShift = direction.horizontal === 'Left' ? Infinity : -Infinity;
  let previous: AlignmentNode | undefined;
  for (const node of nodes) {
    if (previous && previous.vertex.level !== node.vertex.level) previous = undefined;
    node.medianNeighbors = medianNeighbors(node, direction, map);
    node.prevSibling = previous;
    node.x = initialX;
    node.shift = initialShift;
    previous = node;
  }
  return nodes;
}

function medianNeighbors(node: AlignmentNode, direction: Direction,
  map: ReadonlyMap<HierarchyVertex, AlignmentNode>): AlignmentNode[] {
  const vertex = node.vertex;
  const neighbors = [...(direction.vertical === 'Top' ? vertex.aboves : vertex.belows)]
    .filter((other) => Math.abs(other.level - vertex.level) === 1)
    .map((other) => map.get(other)!)
    .sort((a, b) => a.vertex.topLeft.x - b.vertex.topLeft.x);
  if (neighbors.length < 2) return neighbors;
  const left = neighbors[Math.floor((neighbors.length - 1) / 2)]!;
  if (neighbors.length % 2 === 1) return [left];
  const right = neighbors[Math.ceil((neighbors.length - 1) / 2)]!;
  return direction.horizontal === 'Left' ? [left, right] : [right, left];
}

function markConflicts(byLevel: HierarchyVertex[][]): Map<HierarchyVertex, Set<HierarchyVertex>> {
  const conflicts = new Map<HierarchyVertex, Set<HierarchyVertex>>();
  const add = (a: HierarchyVertex, b: HierarchyVertex): void => {
    const set = conflicts.get(a) ?? new Set<HierarchyVertex>();
    set.add(b); conflicts.set(a, set);
  };
  for (let level = 1; level < byLevel.length - 1; level++) {
    const next = byLevel[level + 1]!;
    let k0 = 0, l = 0;
    for (const [index, vertex] of next.entries()) {
      let k1: number;
      if (index === next.length - 1) k1 = byLevel[level]!.at(-1)!.rank;
      else if (vertex.dummy) {
        const above = [...vertex.aboves].find((candidate) => candidate.dummy);
        k1 = above?.rank ?? 0;
      } else continue;
      for (; l <= index; l++) {
        for (const above of next[l]!.aboves) {
          if (above.rank < k0 || above.rank > k1) {
            add(next[l]!, above); add(above, next[l]!);
          }
        }
      }
      k0 = k1;
    }
  }
  return conflicts;
}

function verticalAlignment(nodes: readonly AlignmentNode[],
  conflicts: ReadonlyMap<HierarchyVertex, Set<HierarchyVertex>>, horizontal: Horizontal): void {
  let lastAlignedRank = Infinity;
  for (const node of nodes) {
    if (!node.prevSibling) lastAlignedRank = horizontal === 'Left' ? -Infinity : Infinity;
    for (const median of node.medianNeighbors) {
      if (conflicts.get(node.vertex)?.has(median.vertex)
        || node.alignedWith !== node
        || horizontal === 'Left' && lastAlignedRank >= median.vertex.rank
        || horizontal === 'Right' && lastAlignedRank <= median.vertex.rank) continue;
      median.alignedWith = node;
      node.root = median.root;
      node.alignedWith = node.root;
      median.root.blockSize = Math.max(median.root.blockSize, node.blockSize);
      median.root.leftPad = Math.max(median.root.leftPad, node.leftPad);
      median.root.rightPad = Math.max(median.root.rightPad, node.rightPad);
      lastAlignedRank = median.vertex.rank;
    }
  }
}

function horizontalCompaction(nodes: readonly AlignmentNode[], horizontal: Horizontal): void {
  for (const node of nodes) if (node.root === node) placeBlock(node, horizontal);
  for (const node of nodes) {
    node.x = node.root.x;
    if (node.root === node && Number.isFinite(node.sink.shift)) node.x += node.sink.shift;
  }
}

function placeBlock(root: AlignmentNode, horizontal: Horizontal): void {
  if (Number.isFinite(root.x)) return;
  root.x = 0;
  let node = root;
  do {
    if (node.prevSibling) {
      const previous = node.prevSibling.root;
      placeBlock(previous, horizontal);
      if (root.sink === root) root.sink = previous.sink;
      const delta = distanceFromPreviousRoot(previous, root, node, horizontal);
      if (root.sink !== previous.sink) {
        previous.sink.shift = horizontal === 'Left'
          ? Math.min(previous.sink.shift, root.x - previous.x - previous.blockSize - delta)
          : Math.max(previous.sink.shift, root.x - previous.x + root.blockSize + delta);
      } else {
        root.x = horizontal === 'Left'
          ? Math.max(root.x, previous.x + previous.blockSize + delta)
          : Math.min(root.x, previous.x - root.blockSize - delta);
      }
    }
    node = node.alignedWith;
  } while (node !== root);
}

function distanceFromPreviousRoot(previous: AlignmentNode, current: AlignmentNode,
  node: AlignmentNode, horizontal: Horizontal): number {
  let pad = current.vertex.dummy || node.prevSibling?.vertex.dummy
    ? siblingDummySpacing : siblingSpacing;
  pad += horizontal === 'Left'
    ? previous.rightPad + current.leftPad
    : previous.leftPad + current.rightPad;
  return pad;
}

function roundAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
