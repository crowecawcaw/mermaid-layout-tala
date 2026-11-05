// Translated internal/layoutgraph/node.go connectedNodes and connected_set.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import { isDescendantOf } from './edge-abduction.js';
export function connectedNodes(
  node: Node,
  excludedNodes: (Node | null)[],
  graph: Graph,
): Node[] {
  const out: Node[] = [],
    queue = [node],
    seen = new Set<Node>([node]),
    excluded = new Set(excludedNodes);
  const add = (n: Node): void => {
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  };
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    let blocked = false;
    for (const e of excludedNodes)
      if (
        isDescendantOf(current, e) ||
        (isDescendantOf(e, current) && !isDescendantOf(node, current))
      ) {
        blocked = true;
        break;
      }
    if (blocked) continue;
    out.push(current);
    for (const edge of current.Edges) {
      const adjacent = current.Adjacent(edge);
      if (!excluded.has(adjacent)) add(adjacent);
    }
    if (current.isClusterVessel)
      for (const member of graph.Clusters.get(current)!.Nodes)
        if (member.isContainer)
          for (const child of graph.Containers.get(member) ?? []) add(child);
    for (const [vessel, cluster] of graph.Clusters)
      for (const member of cluster.Nodes)
        if (member.isContainer) {
          let childIs = false,
            excludedChild = false;
          for (const child of graph.Containers.get(member) ?? []) {
            if (child === current) childIs = true;
            if (excluded.has(child)) {
              excludedChild = true;
              break;
            }
          }
          if (!excludedChild && childIs) add(vessel);
        }
    for (const [container, children] of graph.Containers) {
      if (!container || excluded.has(container)) continue;
      let childIs = false,
        excludedChild = false;
      for (const child of children) {
        if (child === current) childIs = true;
        if (excluded.has(child)) {
          excludedChild = true;
          break;
        }
      }
      if (excludedChild) continue;
      if (childIs) add(container);
      if (current === container) for (const child of children) add(child);
    }
  }
  return out;
}
export function ConnectedNodeSet(
  node: Node,
  excludedNodes: (Node | null)[],
  graph: Graph,
): Node[] {
  if (
    graph.Nodes.length < 32 ||
    (graph.Clusters.size === 0 && graph.Containers.size <= 1)
  )
    return connectedNodes(node, excludedNodes, graph);
  const excluded = new Set(excludedNodes),
    excludedChildren = new Map<Node, boolean>(),
    first = new Map<Node, Node>(),
    more = new Map<Node, Node[]>();
  const addOwner = (child: Node, parent: Node): void => {
    if (!first.has(child)) {
      first.set(child, parent);
      return;
    }
    const list = more.get(child) ?? [];
    list.push(parent);
    more.set(child, list);
  };
  for (const [container, children] of graph.Containers) {
    if (!container) continue;
    const blocked = children.some((n) => excluded.has(n));
    excludedChildren.set(container, blocked);
    if (blocked || excluded.has(container)) continue;
    for (const child of children) addOwner(child, container);
  }
  for (const [vessel, cluster] of graph.Clusters)
    for (const member of cluster.Nodes) {
      if (!member.isContainer || excludedChildren.get(member)) continue;
      for (const child of graph.Containers.get(member) ?? [])
        addOwner(child, vessel);
    }
  const out: Node[] = [],
    queue = [node],
    seen = new Set<Node>([node]);
  const add = (n: Node): void => {
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  };
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    let blocked = false;
    for (const e of excludedNodes)
      if (
        isDescendantOf(current, e) ||
        (isDescendantOf(e, current) && !isDescendantOf(node, current))
      ) {
        blocked = true;
        break;
      }
    if (blocked) continue;
    out.push(current);
    for (const edge of current.Edges) {
      const adjacent = current.Adjacent(edge);
      if (!excluded.has(adjacent)) add(adjacent);
    }
    if (current.isClusterVessel)
      for (const member of graph.Clusters.get(current)!.Nodes)
        if (member.isContainer)
          for (const child of graph.Containers.get(member) ?? []) add(child);
    const owner = first.get(current);
    if (owner) add(owner);
    for (const extra of more.get(current) ?? []) add(extra);
    if (!excluded.has(current) && !excludedChildren.get(current))
      for (const child of graph.Containers.get(current) ?? []) add(child);
  }
  return out;
}
