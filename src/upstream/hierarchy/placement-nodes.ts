// Translated from internal/hierarchy/{placement,crossing}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Random } from '../limits/optimization.js';
import { countHierarchyStructuralEdges } from './eligibility.js';
export class PlacementNode {
  rank = 0;
  aboves = new Set<PlacementNode>();
  belows = new Set<PlacementNode>();
  container: PlacementNode | null = null;
  children: PlacementNode[] = [];
  optimizeChildrenCrossings = true;
  isChainingConnection = false;
  isContainer = false;
  isDummy = false;
  constructor(
    public level: number,
    public graphNode: Node | null,
  ) {}
  degree(): number {
    return this.isDummy ? 2 : countHierarchyStructuralEdges(this.graphNode!);
  }
  findNonDummyNode(above: boolean): PlacementNode {
    let node: PlacementNode = this;
    while (node.isDummy && node.isChainingConnection)
      node = (above ? node.aboves : node.belows).values().next().value!;
    return node;
  }
  connect(originalAbove: PlacementNode): void {
    let below: PlacementNode = this,
      above = originalAbove;
    if (above.level === below.level) return;
    if (above.level > below.level) [below, above] = [above, below];
    below.aboves.add(above);
    above.belows.add(below);
  }
}
function shuffle(nodes: PlacementNode[], random: Random): void {
  let i = nodes.length - 1;
  for (; i > 2147483646; i--) {
    const j = Number(random.int63n(BigInt(i + 1)));
    [nodes[i], nodes[j]] = [nodes[j]!, nodes[i]!];
  }
  for (; i > 0; i--) {
    const n = i + 1;
    let product = BigInt(random.uint32()) * BigInt(n),
      low = Number(BigInt.asUintN(32, product));
    if (low < n) {
      const threshold = (-n >>> 0) % n;
      while (low < threshold) {
        product = BigInt(random.uint32()) * BigInt(n);
        low = Number(BigInt.asUintN(32, product));
      }
    }
    const j = Number(product >> 32n);
    [nodes[i], nodes[j]] = [nodes[j]!, nodes[i]!];
  }
}
export function createPlacementNodes(
  g: Graph,
  nodes: Node[],
  random: Random | null,
): PlacementNode[] {
  const result: PlacementNode[] = [];
  for (const node of nodes) {
    const pn = new PlacementNode(node.Hierarchy!.Levels().get(node) ?? 0, node);
    result.push(pn);
    if (node.IsTable()) {
      pn.optimizeChildrenCrossings = false;
      for (let i = 0; i < node.NumColumns(); i++) {
        const child = new PlacementNode(pn.level, null);
        child.container = pn;
        child.isDummy = true;
        pn.children.push(child);
      }
    } else {
      for (const child of createPlacementNodes(
        g,
        g.Containers.get(node) ?? [],
        random,
      ))
        if (!child.container) {
          child.container = pn;
          pn.children.push(child);
        }
      pn.isContainer = pn.children.length > 0;
    }
  }
  if (random) shuffle(result, random);
  return result;
}
export function connectPlacementNodes(g: Graph, nodes: PlacementNode[]): void {
  const map = new Map<Node | null, PlacementNode>(),
    queue = [...nodes];
  for (let i = 0; i < queue.length; i++) {
    const pn = queue[i]!;
    map.set(pn.graphNode, pn);
    queue.push(...pn.children);
  }
  for (const edge of g.Edges) {
    let from = map.get(edge.From)!,
      to = map.get(edge.To)!;
    to.connect(from);
    if (
      edge.FromTableColumnIndex !== null &&
      edge.ToTableColumnIndex !== null
    ) {
      from = from.children[edge.FromTableColumnIndex]!;
      to = to.children[edge.ToTableColumnIndex]!;
      to.connect(from);
    }
  }
}
export function groupPlacementNodesByLevel(
  nodes: PlacementNode[],
): Map<number, PlacementNode[]> {
  const out = new Map<number, PlacementNode[]>();
  for (const pn of nodes) {
    const list = out.get(pn.level) ?? [];
    list.push(pn);
    out.set(pn.level, list);
  }
  return out;
}
export function computeLevelRanks(nodes: PlacementNode[]): void {
  const stack = [...nodes].reverse();
  let rank = 0;
  while (stack.length) {
    const node = stack.pop()!;
    node.rank = rank++;
    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push(node.children[i]!);
  }
}
export function initializeRanks(levels: Map<number, PlacementNode[]>): void {
  for (let i = 0; i < levels.size; i++) computeLevelRanks(levels.get(i) ?? []);
}
export function breakLongConnections(
  nodes: PlacementNode[],
  levels: Map<number, PlacementNode[]>,
): PlacementNode[] {
  const dummies: PlacementNode[] = [];
  for (const pn of nodes) {
    const belows = [...pn.belows]
      .filter((b) => b.level - pn.level > 1)
      .sort((a, b) => a.rank - b.rank || a.level - b.level);
    for (const below of belows) {
      pn.belows.delete(below);
      below.aboves.delete(pn);
      let above = pn;
      for (let level = pn.level + 1; level < below.level; level++) {
        const dummy = new PlacementNode(
          level,
          new Node(BigInt(-dummies.length - 1), 1, 1),
        );
        dummy.isChainingConnection = true;
        dummy.isDummy = true;
        const list = levels.get(level) ?? [];
        dummy.rank = list.length;
        dummy.connect(above);
        dummies.push(dummy);
        list.push(dummy);
        levels.set(level, list);
        above = dummy;
      }
      below.connect(above);
    }
    dummies.push(...breakLongConnections(pn.children, levels));
  }
  return dummies;
}
export function removeTableColumnNodes(
  nodes: PlacementNode[],
): PlacementNode[] {
  const result: PlacementNode[] = [];
  for (const node of nodes) {
    if (node.isDummy) {
      if (!node.graphNode) continue;
      if (node.isChainingConnection) {
        const above = node.findNonDummyNode(true),
          below = node.findNonDummyNode(false);
        if (!above.graphNode || !below.graphNode) continue;
      }
    }
    result.push(node);
    node.children = removeTableColumnNodes(node.children);
  }
  return result;
}
