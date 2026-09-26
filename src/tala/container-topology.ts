import { TalaGraph, TalaNode, type TalaEdge } from './graph.js';

export interface ContainerEdgeAbduction {
  edge: TalaEdge;
  originallyFrom?: TalaNode;
  originallyTo?: TalaNode;
  currentFrom?: TalaNode;
  currentTo?: TalaNode;
}

interface EndpointLocation {
  child?: TalaNode;
  direct: boolean;
}

function endpointLocation(node: TalaNode, children: ReadonlySet<TalaNode>): EndpointLocation {
  if (children.has(node)) return { child: node, direct: true };
  const visited = new Set<TalaNode>();
  let parent = node.parent;
  while (parent && !visited.has(parent)) {
    if (children.has(parent)) return { child: parent, direct: false };
    visited.add(parent);
    parent = parent.parent;
  }
  return { direct: false };
}

function reconnect(edge: TalaEdge, oldNode: TalaNode, newNode: TalaNode,
  to: boolean): void {
  if (oldNode === newNode) return;
  const oldIndex = oldNode.edges.indexOf(edge);
  if (oldIndex >= 0) oldNode.edges.splice(oldIndex, 1);
  if (to) edge.to = newNode;
  else edge.from = newNode;
  if (!newNode.edges.includes(edge)) newNode.edges.push(edge);
}

/**
 * The container-only part of layoutgraph.Graph.abductEdges. The caller gets
 * the child graph's projected edge list and can restore original endpoints.
 */
export function projectContainerEdges(graph: TalaGraph, container: TalaNode | null): {
  projected: TalaEdge[];
  abductions: ContainerEdgeAbduction[];
  restore(): void;
} {
  const children = new Set(graph.containers.get(container) ?? []);
  const endpoints = new Map(graph.edges.map((edge) => [edge, { from: edge.from, to: edge.to }]));
  const adjacency = new Map(graph.nodes.map((node) => [node, [...node.edges]]));
  const projected: TalaEdge[] = [];
  const abductions: ContainerEdgeAbduction[] = [];
  for (const edge of graph.edges) {
    const from = endpointLocation(edge.from, children);
    const to = endpointLocation(edge.to, children);
    if (!from.child || !to.child) continue;
    if (from.child === to.child) {
      // An edge from a direct child to its own descendant is omitted while
      // placing that child, exactly as in Graph.abductEdges.
      if (from.direct !== to.direct) {
        abductions.push({ edge, originallyFrom: edge.from, originallyTo: edge.to });
        const fromIndex = edge.from.edges.indexOf(edge);
        if (fromIndex >= 0) edge.from.edges.splice(fromIndex, 1);
        if (edge.to !== edge.from) {
          const toIndex = edge.to.edges.indexOf(edge);
          if (toIndex >= 0) edge.to.edges.splice(toIndex, 1);
        }
      }
      continue;
    }
    const abduction: ContainerEdgeAbduction = { edge,
      currentFrom: from.child, currentTo: to.child };
    if (!from.direct) {
      abduction.originallyFrom = edge.from;
      reconnect(edge, edge.from, from.child, false);
    }
    if (!to.direct) {
      abduction.originallyTo = edge.to;
      reconnect(edge, edge.to, to.child, true);
    }
    if (abduction.originallyFrom || abduction.originallyTo) abductions.push(abduction);
    projected.push(edge);
  }
  let restored = false;
  return { projected, abductions, restore(): void {
    if (restored) return;
    for (const [edge, original] of endpoints) {
      edge.from = original.from;
      edge.to = original.to;
    }
    for (const [node, edges] of adjacency) node.edges.splice(0, node.edges.length, ...edges);
    restored = true;
  } };
}
