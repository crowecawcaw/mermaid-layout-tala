// Translated from internal/layoutgraph/node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
export interface ReachabilityWork {
  Step(): void;
  Finish(): void;
}
export function ancestryParent(node: Node | null): Node | null {
  if (node === null) return null;
  if (node.Container !== null) return node.Container;
  if (node.Cluster !== null) return node.Cluster.Vessel;
  if (node.Sequence !== null) return node.Sequence.Vessel;
  return null;
}
export function reachabilityIsDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: ReachabilityWork,
): boolean {
  if (guard === null)
    throw new Error('TALA reachability ancestry requires a work guard');
  for (let current = descendant; ; current = ancestryParent(current)) {
    guard.Step();
    if (ancestor === current) return true;
    if (current === null) return false;
  }
}
export function allReachableNodesGuarded(
  node: Node,
  includeContainers: boolean,
  includeNears: boolean,
  traverseTrees: boolean,
  ignore: Set<Node> | null,
  guard: ReachabilityWork,
): Node[] {
  return reachableNodesGuarded(
    node,
    () => true,
    includeContainers,
    includeNears,
    traverseTrees,
    ignore,
    guard,
  );
}
export function reachableNodesGuarded(
  node: Node,
  shouldVisit: (node: Node) => boolean,
  includeContainers: boolean,
  includeNears: boolean,
  traverseTrees: boolean,
  ignore: Set<Node> | null,
  guard: ReachabilityWork,
): Node[] {
  const reachable: Node[] = [],
    visitQueue = [node],
    reachedOrVisited = new Set<Node>([node]);
  const queue = (n: Node) => {
    if (ignore?.has(n) || reachedOrVisited.has(n) || !shouldVisit(n)) return;
    reachedOrVisited.add(n);
    visitQueue.push(n);
  };
  for (let i = 0; i < visitQueue.length; i++) {
    guard.Step();
    const curr = visitQueue[i]!;
    let includeNode = true;
    if (traverseTrees && node.Graph!.NodeToTree.has(curr)) includeNode = false;
    if (includeNode) reachable.push(curr);
    reachedOrVisited.add(curr);
    for (const edge of curr.Edges) {
      guard.Step();
      queue(curr.Adjacent(edge));
    }
    if (traverseTrees) {
      const trees = node.Graph!.Trees.get(curr);
      if (trees !== undefined) {
        for (const tree of trees) {
          guard.Step();
          queue(tree.Node);
        }
      } else {
        const tree = node.Graph!.NodeToTree.get(curr);
        if (tree !== undefined) {
          if (tree.Parent !== null) queue(tree.Parent.Node);
          else
            queue(
              tree.SentinelEdge!.From === tree.Node
                ? tree.SentinelEdge!.To
                : tree.SentinelEdge!.From,
            );
          for (const child of tree.Children) {
            guard.Step();
            queue(child.Node);
          }
        }
      }
    }
    if (includeNears) {
      const nears = curr.orderedNears();
      if (curr.isClusterVessel)
        for (const cn of node.Graph!.Clusters.get(curr)!.Nodes)
          nears.push(...cn.orderedNears());
      for (let near of nears) {
        guard.Step();
        if (near.Cluster !== null && near.Cluster.Vessel!.Graph !== null)
          near = near.Cluster.Vessel!;
        else if (near.Sequence !== null && near.Sequence.Vessel!.Graph !== null)
          near = near.Sequence.Vessel!;
        if (near.Container !== node.Container) continue;
        queue(near);
      }
    }
    if (includeContainers) {
      if (curr.Sequence !== null)
        for (const step of curr.Sequence.Nodes) {
          guard.Step();
          queue(step);
        }
      if (curr.isClusterVessel)
        for (const child of node.Graph!.Clusters.get(curr)!.Nodes) {
          guard.Step();
          queue(child);
        }
      for (const other of node.Graph!.Nodes) {
        guard.Step();
        if (reachedOrVisited.has(other)) continue;
        let descendant = reachabilityIsDescendantOf(curr, other, guard);
        if (!descendant)
          descendant = reachabilityIsDescendantOf(other, curr, guard);
        if (descendant) queue(other);
      }
    }
  }
  return reachable;
}
