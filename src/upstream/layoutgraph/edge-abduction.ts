// Translated from internal/layoutgraph/layout.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { EdgeAbduction } from './records.js';
import { reconnectEdge } from './edge-topology.js';
export function isDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
): boolean {
  for (;;) {
    if (ancestor === descendant) return true;
    if (descendant === null) return false;
    if (descendant.Container !== null) descendant = descendant.Container;
    else if (descendant.Cluster !== null)
      descendant = descendant.Cluster.Vessel;
    else if (descendant.Sequence !== null)
      descendant = descendant.Sequence.Vessel;
    else return ancestor === null;
  }
}
export function ClusterRDFSOrder(g: Graph): Node[] {
  const order: Node[] = [];
  for (const container of [
    ...g.containerRDFSOrderContext(null, { Step() {} }),
    null,
  ])
    for (const child of g.Containers.get(container) ?? [])
      if (child.isClusterVessel) order.push(child);
  return order;
}
export function ApplyEdgeAbductions(abductions: EdgeAbduction[]): void {
  for (const a of abductions) {
    if (
      a.OriginallyFrom !== null &&
      a.CurrentFrom !== null &&
      a.OriginallyFrom !== a.CurrentFrom
    )
      reconnectEdge(a.Edge, a.CurrentFrom, false);
    if (
      a.OriginallyTo !== null &&
      a.CurrentTo !== null &&
      a.OriginallyTo !== a.CurrentTo
    )
      reconnectEdge(a.Edge, a.CurrentTo, true);
  }
}
export function RestoreEdgeAbductions(
  g: Graph,
  abductions: EdgeAbduction[],
): EdgeAbduction[] {
  const nodes = new Set<Node>(),
    queue = [...g.Nodes];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    nodes.add(node);
    if (node.isContainer) queue.push(...(g.Containers.get(node) ?? []));
    const sequence = g.Sequences.get(node);
    if (sequence !== undefined) queue.push(...sequence.Nodes);
    if (node.isClusterVessel) queue.push(...g.Clusters.get(node)!.Nodes);
  }
  const remaining: EdgeAbduction[] = [];
  for (const a of abductions) {
    const from = a.OriginallyFrom ?? a.CurrentFrom,
      to = a.OriginallyTo ?? a.CurrentTo;
    if (from === null || to === null || !nodes.has(from) || !nodes.has(to)) {
      remaining.push(a);
      continue;
    }
    if (a.OriginallyFrom !== null) {
      if (a.OriginallyFrom.Cluster !== null)
        a.OriginallyFrom = a.OriginallyFrom.Cluster.Vessel;
      if (a.OriginallyFrom!.Sequence !== null)
        a.OriginallyFrom = a.OriginallyFrom!.Sequence.Vessel;
      if (a.CurrentFrom !== a.OriginallyFrom)
        reconnectEdge(a.Edge, a.OriginallyFrom!, false);
    }
    if (a.OriginallyTo !== null) {
      if (a.OriginallyTo.Cluster !== null)
        a.OriginallyTo = a.OriginallyTo.Cluster.Vessel;
      if (a.OriginallyTo!.Sequence !== null)
        a.OriginallyTo = a.OriginallyTo!.Sequence.Vessel;
      if (a.CurrentTo !== a.OriginallyTo)
        reconnectEdge(a.Edge, a.OriginallyTo!, true);
    }
  }
  return remaining;
}
export function AbductEdges(
  fromGraph: Graph,
  container: Node | null,
  toGraph: Graph,
): EdgeAbduction[] {
  const edgeAbductions: EdgeAbduction[] = [];
  for (const cluster of fromGraph.Clusters.values())
    edgeAbductions.push(...cluster.EdgeAbductions);
  for (const sequence of fromGraph.Sequences.values())
    edgeAbductions.push(...sequence.EdgeAbductions);
  const used = new Array<boolean>(edgeAbductions.length).fill(false),
    containerAbductions: EdgeAbduction[] = [];
  for (const edge of fromGraph.Edges) {
    let fromAChild = false,
      toAChild = false,
      fromAChildDescendant = false,
      toAChildDescendant = false,
      fromChildAncestor: Node | null = null,
      toChildAncestor: Node | null = null;
    for (const child of fromGraph.Containers.get(container) ?? []) {
      if (child === edge.From) fromAChild = true;
      else if (isDescendantOf(edge.From, child)) {
        fromAChildDescendant = true;
        fromChildAncestor = child;
      }
      if (child === edge.To) toAChild = true;
      else if (isDescendantOf(edge.To, child)) {
        toAChildDescendant = true;
        toChildAncestor = child;
      }
    }
    if (
      (fromAChild && edge.From === toChildAncestor) ||
      (toAChild && edge.To === fromChildAncestor)
    ) {
      containerAbductions.push({
        Edge: edge,
        OriginallyTo: edge.To,
        OriginallyFrom: edge.From,
        CurrentFrom: null,
        CurrentTo: null,
      });
      edge.From.RemoveIncidentEdge(edge);
      edge.To.RemoveIncidentEdge(edge);
    } else if (fromAChild && toAChild) {
      toGraph.AddEdge(edge);
      for (let i = 0; i < edgeAbductions.length; i++) {
        if (used[i]) continue;
        const ea = edgeAbductions[i]!;
        if (ea.CurrentFrom === edge.From && ea.CurrentTo === edge.To) {
          const a: EdgeAbduction = {
            Edge: edge,
            CurrentFrom: edge.From,
            CurrentTo: edge.To,
            OriginallyFrom: null,
            OriginallyTo: null,
          };
          if (ea.OriginallyFrom !== null) a.OriginallyFrom = ea.OriginallyFrom;
          else a.OriginallyTo = ea.OriginallyTo;
          used[i] = true;
          containerAbductions.push(a);
          break;
        }
      }
    } else {
      if (fromAChildDescendant && toAChild) {
        containerAbductions.push({
          Edge: edge,
          OriginallyFrom: edge.From,
          OriginallyTo: null,
          CurrentFrom: fromChildAncestor,
          CurrentTo: edge.To,
        });
        reconnectEdge(edge, fromChildAncestor!, false);
        toGraph.AddEdge(edge);
      } else if (toAChildDescendant && fromAChild) {
        containerAbductions.push({
          Edge: edge,
          OriginallyTo: edge.To,
          OriginallyFrom: null,
          CurrentTo: toChildAncestor,
          CurrentFrom: edge.From,
        });
        reconnectEdge(edge, toChildAncestor!, true);
        toGraph.AddEdge(edge);
      } else if (
        fromAChildDescendant &&
        toAChildDescendant &&
        fromChildAncestor !== toChildAncestor
      ) {
        containerAbductions.push({
          Edge: edge,
          OriginallyTo: edge.To,
          OriginallyFrom: edge.From,
          CurrentTo: toChildAncestor,
          CurrentFrom: fromChildAncestor,
        });
        reconnectEdge(edge, fromChildAncestor!, false);
        reconnectEdge(edge, toChildAncestor!, true);
        toGraph.AddEdge(edge);
      }
    }
  }
  for (const a of containerAbductions) {
    for (let i = 0; i < edgeAbductions.length; i++) {
      if (used[i]) continue;
      const ea = edgeAbductions[i]!;
      let match = false;
      if (a.OriginallyFrom === null) {
        if (a.CurrentFrom === ea.CurrentFrom && a.OriginallyTo === ea.CurrentTo)
          match = true;
      } else if (a.OriginallyTo === null) {
        if (a.CurrentTo === ea.CurrentTo && a.OriginallyFrom === ea.CurrentFrom)
          match = true;
      } else if (
        a.OriginallyTo === ea.CurrentTo &&
        a.OriginallyFrom === ea.CurrentFrom
      )
        match = true;
      if (match) {
        used[i] = true;
        if (ea.OriginallyFrom !== null) a.OriginallyFrom = ea.OriginallyFrom;
        else a.OriginallyTo = ea.OriginallyTo;
        break;
      }
    }
  }
  return containerAbductions;
}
