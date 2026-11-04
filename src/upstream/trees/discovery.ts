// Translated tree discovery from internal/trees/layout.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import { Tree } from '../layoutgraph/records.js';
import { WorkGuard } from '../limits/work.js';
import { treePreprocessBadState as bad } from './geometry.js';
import { TreeEdgeDirection as D, treeEdgeDirection } from './types.js';
import {
  buildTreeAdjacencyMatrix,
  treeFringeNodes,
  filterTerminalTrees,
  countTreeDirections,
  addTreeChild,
  removeNodeFromGraph,
  disconnectTreeEdge,
  removeNodeFromContainer,
  treeContainerRDFSOrder,
  candidateTreeRoots,
  treeEndOfLine,
  reverseTreeChain,
  isIsolatedTreeGuarded,
  treeBranches,
  reconnectTreeGuarded,
} from './preprocess-helpers.js';
export function extractTreesInContainer(
  g: Graph,
  container: Node | null,
  guard: WorkGuard,
): Map<Node, Tree[]> {
  const containerNodes = g.Containers.get(container) ?? [],
    nodeToTree = new Map<Node, Tree>();
  for (const node of containerNodes) {
    guard.Step();
    if (!node) throw bad('tree container contains a nil node');
    if (node.IsTable()) return new Map();
    nodeToTree.set(node, new Tree(node));
  }
  const edgeBetween = buildTreeAdjacencyMatrix(g, guard),
    terminal = new Set<Node | null>(),
    roots = new Map<Node, Tree[]>(),
    arrowheads = new Map<Node, Set<string>>();
  for (const c of g.Containers.keys()) {
    guard.Step();
    terminal.add(c);
  }
  for (const vessel of g.Sequences.keys()) {
    guard.Step();
    terminal.add(vessel);
  }
  for (const n of g.Nodes) {
    guard.Step();
    if (n.Nears.size > 0 || n.FixedTopLeft !== null) terminal.add(n);
  }
  for (;;) {
    const fringe: Node[] = [],
      candidates = treeFringeNodes(containerNodes, guard);
    for (const n of candidates) {
      guard.Step();
      if (!terminal.has(n)) fringe.push(n);
    }
    if (!fringe.length) break;
    for (const fn of fringe) {
      guard.Step();
      if (terminal.has(fn)) continue;
      if (fn.Edges.length !== 1 || !fn.Edges[0])
        throw bad(`fringe node ${fn.ID} has invalid degree`);
      const sentinel = fn.Adjacent(fn.Edges[0]);
      if (!sentinel) throw bad(`fringe node ${fn.ID} has no sentinel`);
      if (
        sentinel.Edges.length === 1 &&
        sentinel.Adjacent(sentinel.Edges[0]!) === fn &&
        !terminal.has(sentinel)
      ) {
        terminal.add(fn);
        continue;
      }
      const tree = nodeToTree.get(fn);
      if (!tree) throw bad(`fringe node ${fn.ID} has no tree record`);
      tree.SentinelEdge = edgeBetween(fn, sentinel);
      if (!tree.SentinelEdge)
        throw bad(`fringe node ${fn.ID} has no graph sentinel edge`);
      if (!roots.has(sentinel)) {
        roots.set(sentinel, []);
        arrowheads.set(sentinel, new Set());
      }
      const ah = tree.SentinelEdge.ArrowheadTo(sentinel);
      roots.get(sentinel)!.push(tree);
      arrowheads.get(sentinel)!.add(ah);
      if (roots.has(fn)) {
        const children = filterTerminalTrees(roots.get(fn)!, terminal, guard);
        if (!children.length) continue;
        const counts = countTreeDirections(children, guard);
        if (counts.size > 1 || arrowheads.get(fn)!.size > 1) terminal.add(fn);
        else {
          for (const child of children) addTreeChild(tree, child, guard);
          const hasUndirected = counts.has(D.Undirected),
            direction = treeEdgeDirection(fn, tree.SentinelEdge),
            hasDirection = counts.has(direction);
          if (!(hasUndirected || direction === D.Undirected) && !hasDirection)
            terminal.add(sentinel);
        }
      }
    }
    for (const fn of fringe) {
      guard.Step();
      if (!terminal.has(fn)) {
        removeNodeFromGraph(fn, g, guard);
        disconnectTreeEdge(g, nodeToTree.get(fn)!.SentinelEdge!, guard);
        removeNodeFromContainer(g, container, fn, guard);
      }
    }
  }
  const result = new Map<Node, Tree[]>();
  // A Go range captures the current slice even if handleTreeSubgraph replaces g.Nodes.
  for (const node of g.Nodes) {
    guard.Step();
    if (roots.has(node)) {
      const filtered = filterTerminalTrees(roots.get(node)!, terminal, guard);
      if (!filtered.length) continue;
      if (g.Sequences.has(node)) result.set(node, filtered);
      else {
        const [sentinel, trees] = handleTreeSubgraph(
          g,
          node,
          container,
          filtered,
          guard,
        );
        result.set(sentinel, trees);
      }
    }
  }
  guard.Check();
  return result;
}
export function extractTrees(g: Graph, guard: WorkGuard): Map<Node, Tree[]> {
  const result = new Map<Node, Tree[]>(),
    order: (Node | null)[] = treeContainerRDFSOrder(g, null, guard);
  order.push(null);
  for (const container of order) {
    guard.Step();
    const trees = extractTreesInContainer(g, container, guard);
    for (const [sentinel, roots] of trees) {
      guard.Step();
      result.set(sentinel, roots);
    }
  }
  return result;
}
export function handleTreeSubgraph(
  g: Graph,
  sentinel: Node,
  container: Node | null,
  roots: Tree[],
  guard: WorkGuard,
): [Node, Tree[]] {
  if (
    !(sentinel.Edges.length === 0 && roots.length > 1) ||
    sentinel.IsContainer()
  )
    return [sentinel, roots];
  let newSentinel: Node | null = null,
    newTreeRoot: Tree | null = null;
  const candidates = candidateTreeRoots(roots, guard);
  for (const candidate of candidates) {
    guard.Step();
    const newRoot = treeEndOfLine(candidate, guard);
    if (newRoot) {
      const joint = new Tree(sentinel);
      for (const other of roots) {
        guard.Step();
        if (other !== newRoot) addTreeChild(joint, other, guard);
      }
      const edge = candidate.SentinelEdge;
      reverseTreeChain(candidate, guard);
      addTreeChild(candidate, joint, guard);
      joint.SentinelEdge = edge;
      newSentinel = newRoot.Node;
      newTreeRoot = newRoot.Children[0]!;
      newTreeRoot.Parent = null;
      break;
    }
  }
  if (newSentinel && newTreeRoot) {
    removeNodeFromGraph(sentinel, g, guard);
    g.AddNodeUnchecked(newSentinel);
    guard.Step();
    const filtered: Node[] = [];
    for (const n of g.Containers.get(container) ?? []) {
      guard.Step();
      if (n !== sentinel) filtered.push(n);
    }
    filtered.push(newSentinel);
    g.Containers.set(container, filtered);
    return [newSentinel, [newTreeRoot]];
  }
  return [sentinel, roots];
}
export function putBackNonBranchingTrees(g: Graph, guard: WorkGuard): void {
  const order: (Node | null)[] = treeContainerRDFSOrder(g, null, guard);
  order.push(null);
  for (const container of order) {
    guard.Step();
    const nodes = g.Containers.get(container) ?? [];
    for (const node of nodes.slice()) {
      guard.Step();
      const roots = g.Trees.get(node);
      if (roots === undefined) continue;
      if (!roots.length) throw bad(`tree sentinel ${node.ID} has no roots`);
      const isolated = isIsolatedTreeGuarded(g, node, guard);
      let firstBranches = false;
      if (isolated && roots.length === 1)
        firstBranches = treeBranches(roots[0]!, guard);
      if (
        isolated &&
        (roots.length > 1 || firstBranches) &&
        !g.Sequences.has(node)
      )
        continue;
      const branching: Tree[] = [];
      for (const root of roots) {
        guard.Step();
        if (!treeBranches(root, guard)) {
          const reconnection = new Tree(node);
          addTreeChild(reconnection, root, guard);
          reconnectTreeGuarded(g, reconnection, container, guard);
        } else branching.push(root);
      }
      if (branching.length) g.Trees.set(node, branching);
      else g.Trees.delete(node);
    }
  }
  guard.Check();
}
