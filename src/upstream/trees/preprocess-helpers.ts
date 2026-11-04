// Translated from internal/trees/preprocess_helpers.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import { Edge } from '../layoutgraph/edge.js';
import { Tree } from '../layoutgraph/records.js';
import { WorkGuard } from '../limits/work.js';
import { treePreprocessBadState as bad } from './geometry.js';
import { TreeEdgeDirection as D, treeEdgeDirection } from './types.js';
export function treeContainerRDFSOrder(
  g: Graph,
  root: Node | null,
  guard: WorkGuard,
): Node[] {
  if (root && !root.IsContainer()) return [];
  const stack: { node: Node; emit: boolean }[] = [],
    order: Node[] = [];
  for (const child of g.Containers.get(root) ?? []) {
    guard.Step();
    stack.push({ node: child, emit: false });
  }
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current.node)
      throw bad('tree preprocessing encountered a nil container child');
    if (current.emit) {
      order.push(current.node);
      continue;
    }
    if (current.node.IsContainer()) {
      stack.push({ node: current.node, emit: true });
      for (const child of g.Containers.get(current.node) ?? []) {
        guard.Step();
        stack.push({ node: child, emit: false });
      }
      continue;
    }
    if (current.node.IsClusterVessel()) {
      const cluster = g.Clusters.get(current.node);
      if (!cluster)
        throw bad(`cluster vessel ${current.node.ID} has no cluster record`);
      for (const n of cluster.Nodes) {
        guard.Step();
        if (!n)
          throw bad(`cluster vessel ${current.node.ID} contains a nil node`);
        if (n.IsContainer()) stack.push({ node: n, emit: false });
      }
    }
  }
  return order;
}
export function buildTreeAdjacencyMatrix(
  g: Graph,
  guard: WorkGuard,
): (a: Node, b: Node) => Edge | null {
  const matrix = new Map<Node, Map<Node, Edge>>();
  for (const edge of g.Edges) {
    guard.Step();
    if (!edge || !edge.From || !edge.To)
      throw bad(
        'tree preprocessing encountered an edge with missing endpoints',
      );
    if (!matrix.has(edge.From)) matrix.set(edge.From, new Map());
    matrix.get(edge.From)!.set(edge.To, edge);
  }
  return (a, b) => matrix.get(a)?.get(b) ?? matrix.get(b)?.get(a) ?? null;
}
export function treeFringeNodes(nodes: Node[], guard: WorkGuard): Node[] {
  const inSet = new Set<Node>();
  for (const n of nodes) {
    guard.Step();
    if (!n) throw bad('tree preprocessing encountered a nil node');
    inSet.add(n);
  }
  const fringe: Node[] = [];
  for (const n of nodes) {
    guard.Step();
    if (n.Edges.length !== 1) continue;
    const edge = n.Edges[0]!;
    if (!edge || (edge.From !== n && edge.To !== n))
      throw bad(`node ${n.ID} contains a non-incident fringe edge`);
    if (inSet.has(n.Adjacent(edge))) fringe.push(n);
  }
  return fringe;
}
export function filterTerminalTrees(
  trees: Tree[],
  terminals: Set<Node | null>,
  guard: WorkGuard,
): Tree[] {
  const result: Tree[] = [];
  for (const tree of trees) {
    guard.Step();
    if (!tree || !tree.Node)
      throw bad('tree preprocessing encountered a tree without a node');
    if (!terminals.has(tree.Node)) result.push(tree);
  }
  return result;
}
export function dominantTreeEdgeDirection(
  root: Tree,
  includeRoot: boolean,
  guard: WorkGuard,
): D {
  if (!root || !root.Node)
    throw bad('tree preprocessing encountered an incomplete tree');
  if (!root.SentinelEdge)
    throw bad(`tree node ${root.Node.ID} has no sentinel edge`);
  const stack: Tree[] = [];
  if (includeRoot) stack.push(root);
  else
    for (let i = root.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(root.Children[i]!);
    }
  const seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node || !current.SentinelEdge)
      throw bad('tree preprocessing encountered an incomplete tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a repeated tree node');
    seen.add(current);
    const direction = treeEdgeDirection(current.Node, current.SentinelEdge);
    if (direction !== D.Undirected) return direction;
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
  return treeEdgeDirection(root.Node, root.SentinelEdge);
}
export function countTreeDirections(
  trees: Tree[],
  guard: WorkGuard,
): Map<D, number> {
  const counts = new Map<D, number>();
  for (const tree of trees) {
    guard.Step();
    const d = dominantTreeEdgeDirection(tree, true, guard);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}
export function candidateTreeRoots(roots: Tree[], guard: WorkGuard): Tree[] {
  const byDirection = new Map<D, Tree[]>();
  for (const root of roots) {
    guard.Step();
    const d = dominantTreeEdgeDirection(root, false, guard);
    const list = byDirection.get(d) ?? [];
    list.push(root);
    byDirection.set(d, list);
  }
  const out = byDirection.get(D.Outwards) ?? [],
    inwards = byDirection.get(D.Inwards) ?? [],
    bi = byDirection.get(D.Bidirectional) ?? [],
    undirected = byDirection.get(D.Undirected) ?? [],
    candidates: Tree[] = [];
  const append = (values: Tree[]) => {
    for (const value of values) {
      guard.Step();
      candidates.push(value);
    }
  };
  if (
    out.length === 1 &&
    1 + inwards.length + undirected.length === roots.length
  )
    append(out);
  if (
    inwards.length === 1 &&
    1 + out.length + undirected.length === roots.length
  )
    append(inwards);
  if (
    undirected.length > 0 &&
    out.length > 1 &&
    undirected.length + out.length === roots.length
  )
    append(undirected);
  if (
    undirected.length > 0 &&
    inwards.length > 1 &&
    undirected.length + inwards.length === roots.length
  )
    append(undirected);
  if (bi.length + undirected.length === roots.length) {
    append(bi);
    append(undirected);
  }
  guard.Check();
  return candidates;
}
export function treeEndOfLine(root: Tree, guard: WorkGuard): Tree | null {
  const seen = new Set<Tree>();
  let current = root;
  for (;;) {
    guard.Step();
    if (!current) throw bad('tree preprocessing encountered a nil tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a tree cycle');
    seen.add(current);
    switch (current.Children.length) {
      case 0:
        return current;
      case 1:
        current = current.Children[0]!;
        break;
      default:
        return null;
    }
  }
}
export function removeTreeChild(
  parent: Tree,
  child: Tree,
  guard: WorkGuard,
): void {
  const filtered: Tree[] = [];
  for (const current of parent.Children) {
    guard.Step();
    if (current !== child) filtered.push(current);
  }
  parent.Children = filtered;
}
export function addTreeChild(
  parent: Tree,
  child: Tree,
  guard: WorkGuard,
): void {
  if (!parent || !child)
    throw bad('tree preprocessing cannot connect a nil tree');
  if (child.Parent) removeTreeChild(child.Parent, child, guard);
  guard.Step();
  child.Parent = parent;
  parent.Children.push(child);
}
export function reverseTreeChain(root: Tree, guard: WorkGuard): void {
  if (!root) throw bad('tree preprocessing cannot reverse a nil tree');
  const chain = [root],
    seen = new Set<Tree>();
  let current = root;
  while (current.Children.length) {
    guard.Step();
    if (current.Children.length !== 1)
      throw bad('tree preprocessing attempted to reverse a branching tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a tree cycle');
    seen.add(current);
    const next = current.Children[0]!;
    if (!next) throw bad('tree preprocessing encountered a nil tree child');
    current.SentinelEdge = next.SentinelEdge;
    next.SentinelEdge = null;
    removeTreeChild(current, next, guard);
    chain.push(next);
    current = next;
  }
  for (let i = chain.length - 1; i > 0; i--)
    addTreeChild(chain[i]!, chain[i - 1]!, guard);
}
export function treeBranches(root: Tree, guard: WorkGuard): boolean {
  const seen = new Set<Tree>();
  let current = root;
  for (;;) {
    guard.Step();
    if (!current) throw bad('tree preprocessing encountered a nil tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a tree cycle');
    seen.add(current);
    switch (current.Children.length) {
      case 0:
        return false;
      case 1:
        current = current.Children[0]!;
        break;
      default:
        return true;
    }
  }
}
export function treeSize(root: Tree, guard: WorkGuard): number {
  if (!root) throw bad('tree preprocessing cannot size a nil tree');
  const stack = [root],
    seen = new Set<Tree>();
  let size = 0;
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node)
      throw bad('tree preprocessing encountered an incomplete tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a repeated tree node');
    seen.add(current);
    size++;
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
  return size;
}
export function treeDescendants(root: Tree, guard: WorkGuard): Tree[] {
  if (!root) throw bad('tree preprocessing cannot traverse a nil tree');
  const descendants: Tree[] = [],
    queue = [root],
    seen = new Set<Tree>();
  for (let index = 0; index < queue.length; index++) {
    guard.Step();
    const current = queue[index]!;
    if (!current || !current.Node)
      throw bad('tree preprocessing encountered an incomplete tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a repeated tree node');
    seen.add(current);
    for (const child of current.Children) {
      guard.Step();
      descendants.push(child);
      queue.push(child);
    }
  }
  return descendants;
}
export function rootsByTreeDirection(
  roots: Tree[],
  guard: WorkGuard,
): Map<D, Tree[]> {
  const byDirection = new Map<D, Tree[]>();
  for (const root of roots) {
    guard.Step();
    const d = dominantTreeEdgeDirection(root, false, guard);
    const list = byDirection.get(d) ?? [];
    list.push(root);
    byDirection.set(d, list);
  }
  return byDirection;
}
export function removeNodeFromGraph(
  node: Node,
  graph: Graph,
  guard: WorkGuard,
): void {
  if (!graph.Nodes.length)
    throw bad(`node ${node.ID} is missing from the graph`);
  const nodes: Node[] = [];
  let found = false;
  for (const n of graph.Nodes) {
    guard.Step();
    if (n === node) {
      found = true;
      continue;
    }
    nodes.push(n);
  }
  if (!found) throw bad(`node ${node.ID} is missing from the graph`);
  graph.Nodes = nodes;
}
export function removeEdgeFromNode(
  node: Node,
  edge: Edge,
  guard: WorkGuard,
): void {
  for (let i = 0; i < node.Edges.length; i++) {
    guard.Step();
    if (node.Edges[i] === edge) {
      node.Edges.splice(i, 1);
      return;
    }
  }
  throw bad(`edge ${edge.ID} is missing from node ${node.ID}`);
}
export function disconnectTreeEdge(
  graph: Graph,
  edge: Edge,
  guard: WorkGuard,
): void {
  if (!edge || !edge.From || !edge.To)
    throw bad('tree preprocessing cannot disconnect an incomplete edge');
  removeEdgeFromNode(edge.From, edge, guard);
  if (edge.To !== edge.From) removeEdgeFromNode(edge.To, edge, guard);
  else
    for (const current of edge.To.Edges) {
      guard.Step();
      if (current === edge) {
        removeEdgeFromNode(edge.To, edge, guard);
        break;
      }
    }
  const edges: Edge[] = [];
  let found = false;
  for (const current of graph.Edges) {
    guard.Step();
    if (current === edge) {
      found = true;
      continue;
    }
    edges.push(current);
  }
  if (!found) throw bad(`edge ${edge.ID} is missing from the graph`);
  graph.Edges = edges;
}
export function removeNodeFromContainer(
  graph: Graph,
  container: Node | null,
  node: Node,
  guard: WorkGuard,
): void {
  const filtered: Node[] = [];
  let found = false;
  for (const current of graph.Containers.get(container) ?? []) {
    guard.Step();
    if (current === node) {
      found = true;
      continue;
    }
    filtered.push(current);
  }
  if (!found) throw bad(`node ${node.ID} is missing from its tree container`);
  graph.Containers.set(container, filtered);
}
export function reconnectTreeGuarded(
  g: Graph,
  tree: Tree,
  container: Node | null,
  guard: WorkGuard,
): void {
  if (!tree) throw bad('tree preprocessing cannot reconnect a nil tree');
  const stack = [tree],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node)
      throw bad('tree preprocessing encountered an incomplete tree');
    if (seen.has(current))
      throw bad('tree preprocessing encountered a repeated tree node');
    seen.add(current);
    if (current.Parent) {
      const edge = current.SentinelEdge;
      if (!edge || !edge.From || !edge.To)
        throw bad(`tree node ${current.Node.ID} has no complete sentinel edge`);
      g.AddNodeUnchecked(current.Node);
      g.AddNodeToContainer(container, current.Node);
      edge.From.AddIncidentEdgeUnchecked(edge);
      edge.To.AddIncidentEdgeUnchecked(edge);
      g.Edges.push(edge);
      guard.Step();
    }
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
}
export function isIsolatedTreeGuarded(
  g: Graph,
  node: Node,
  guard: WorkGuard,
): boolean {
  if (!node) throw bad('tree preprocessing encountered a nil tree sentinel');
  if (node.IsContainer()) return false;
  for (const edge of node.Edges) {
    guard.Step();
    let isToTree = false;
    for (const root of g.Trees.get(node) ?? []) {
      guard.Step();
      if (root && edge === root.SentinelEdge) {
        isToTree = true;
        break;
      }
    }
    if (!isToTree) return false;
  }
  return true;
}
export function buildNodeToTreeGuarded(g: Graph, guard: WorkGuard): void {
  const nodeToTree = new Map<Node, Tree>(),
    order: Node[] = [];
  for (const n of g.Trees.keys()) {
    guard.Step();
    order.push(n);
  }
  order.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
  guard.Check();
  for (const sentinel of order) {
    guard.Step();
    for (const root of g.Trees.get(sentinel) ?? []) {
      if (!root || !root.Node)
        throw bad('tree sentinel contains an incomplete root');
      const queue = [root],
        seen = new Set<Tree>();
      for (let index = 0; index < queue.length; index++) {
        guard.Step();
        const current = queue[index]!;
        if (!current || !current.Node)
          throw bad('tree preprocessing encountered an incomplete tree');
        if (seen.has(current))
          throw bad('tree preprocessing encountered a repeated tree node');
        seen.add(current);
        nodeToTree.set(current.Node, current);
        for (const child of current.Children) {
          guard.Step();
          queue.push(child);
        }
      }
    }
  }
  g.NodeToTree = nodeToTree;
  guard.Check();
}
