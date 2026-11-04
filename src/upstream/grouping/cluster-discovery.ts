// Translated from internal/grouping/cluster_discovery.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Cluster, Sequence } from '../layoutgraph/records.js';
import { WorkGuard, MaxEngineNodes } from '../limits/work.js';
import { allDescendantNodesGuarded } from '../layoutgraph/containment.js';
export class ClusterEdgeSignature {
  from = 0;
  to = 0;
  bidirectional = 0;
  undirected = 0;
  directed = 0;
  fromArrowheads = new Set<string>();
  toArrowheads = new Set<string>();
  add(node: Node, edge: Edge): void {
    if (edge.From === node) this.from++;
    if (edge.To === node) this.to++;
    if (edge.IsBidirectional()) this.bidirectional++;
    else if (edge.IsUndirected()) this.undirected++;
    else if (edge.IsDirected()) this.directed++;
    if (edge.From === node) {
      this.fromArrowheads.add(edge.SourceArrowhead);
      this.toArrowheads.add(edge.TargetArrowhead);
    } else {
      this.fromArrowheads.add(edge.TargetArrowhead);
      this.toArrowheads.add(edge.SourceArrowhead);
    }
  }
  arrowTypeCount(): number {
    return (
      Number(this.directed > 0) +
      Number(this.bidirectional > 0) +
      Number(this.undirected > 0)
    );
  }
  matches(other: ClusterEdgeSignature): boolean {
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.bidirectional === other.bidirectional &&
      this.undirected === other.undirected &&
      this.arrowTypeCount() <= 1 &&
      other.arrowTypeCount() <= 1 &&
      arrowheadSetsEqual(this.fromArrowheads, other.fromArrowheads) &&
      arrowheadSetsEqual(this.toArrowheads, other.toArrowheads)
    );
  }
}
export function arrowheadSetsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
export class ClusterDiscoveryInfo {
  neighbors: (Node | null)[] = [];
  neighborSet = new Set<Node | null>();
  edges: Edge[] = [];
  edgeSignature = new ClusterEdgeSignature();
  noClustering = false;
  toTableColumn = false;
  constructor(
    public estimatedWidth: number,
    public estimatedHeight: number,
  ) {}
}
export class ClusterDiscoveryIndex {
  infos = new Map<Node, ClusterDiscoveryInfo>();
  edgeOrder = new Map<Edge, number>();
  edgeNodes = new Map<Edge, Node[]>();
  sequenceEdges = new Map<Sequence, Map<Edge, Node | null>>();
  sequenceOriginal(
    sequence: Sequence,
    edge: Edge,
    guard: WorkGuard,
  ): Node | null {
    let byEdge = this.sequenceEdges.get(sequence);
    if (byEdge === undefined) {
      byEdge = new Map();
      for (const abduction of sequence.EdgeAbductions) {
        guard.Step();
        if (abduction === null || abduction.Edge === null) continue;
        if (abduction.CurrentFrom === sequence.Vessel) {
          if (!byEdge.has(abduction.Edge))
            byEdge.set(abduction.Edge, abduction.OriginallyFrom);
        } else if (abduction.CurrentTo === sequence.Vessel) {
          if (!byEdge.has(abduction.Edge))
            byEdge.set(abduction.Edge, abduction.OriginallyTo);
        }
      }
      this.sequenceEdges.set(sequence, byEdge);
    }
    return byEdge.get(edge) ?? null;
  }
  refreshNeighbors(g: Graph, node: Node, guard: WorkGuard): void {
    const info = this.infos.get(node);
    if (info === undefined)
      throw new Error('TALA AddClusters cannot find node discovery index');
    const neighbors: (Node | null)[] = [],
      neighborSet = new Set<Node | null>();
    for (const edge of node.Edges) {
      guard.Step();
      let adjacent: Node | null = node.Adjacent(edge);
      const sequence = g.Sequences.get(adjacent);
      if (sequence !== undefined)
        adjacent = this.sequenceOriginal(sequence, edge, guard);
      if (!neighborSet.has(adjacent)) {
        neighborSet.add(adjacent);
        neighbors.push(adjacent);
      }
    }
    info.neighbors = neighbors;
    info.neighborSet = neighborSet;
    guard.Finish();
  }
  refreshAfterClusterAbduction(
    g: Graph,
    cluster: Cluster,
    edges: Edge[],
    guard: WorkGuard,
  ): void {
    const affected: Node[] = [],
      seen = new Set<Node>();
    const addAffected = (node: Node | null) => {
      guard.Step();
      if (
        node === null ||
        node === cluster.Vessel ||
        !this.infos.has(node) ||
        seen.has(node)
      )
        return;
      seen.add(node);
      affected.push(node);
    };
    for (const edge of edges)
      for (const node of this.edgeNodes.get(edge) ?? []) addAffected(node);
    for (const node of affected) this.refreshNeighbors(g, node, guard);
    guard.Finish();
  }
}
export function clusterIsDescendantOfGuarded(
  descendant: Node | null,
  ancestor: Node | null,
  guard: WorkGuard,
): boolean {
  const seen = new Set<Node>();
  for (;;) {
    guard.Step();
    if (ancestor === descendant) return true;
    if (descendant === null) return false;
    if (seen.has(descendant))
      throw new Error('TALA AddClusters found a cycle in node ancestry');
    if (seen.size >= MaxEngineNodes)
      throw new Error('TALA AddClusters ancestry exceeds node limit');
    seen.add(descendant);
    if (descendant.Container !== null) descendant = descendant.Container;
    else if (descendant.Cluster !== null && descendant.Cluster.Vessel !== null)
      descendant = descendant.Cluster.Vessel;
    else if (
      descendant.Sequence !== null &&
      descendant.Sequence.Vessel !== null
    )
      descendant = descendant.Sequence.Vessel;
    else return ancestor === null;
  }
}
export function clusterHasLeakyEdgeGuarded(
  g: Graph,
  node: Node,
  guard: WorkGuard,
): boolean {
  if (!node.IsContainer()) return false;
  const descendants = allDescendantNodesGuarded(g, node, true, guard);
  for (const descendant of descendants) {
    guard.Step();
    for (const edge of descendant.Edges) {
      guard.Step();
      if (!clusterIsDescendantOfGuarded(descendant.Adjacent(edge), node, guard))
        return true;
    }
  }
  guard.Finish();
  return false;
}
export function buildClusterDiscoveryIndex(
  g: Graph,
  containerOrder: Node[],
  guard: WorkGuard,
): ClusterDiscoveryIndex {
  const orderedNodes: Node[] = [],
    seenNodes = new Set<Node>();
  const addNode = (node: Node) => {
    guard.Step();
    if (node === null) throw new Error('TALA AddClusters contains a nil node');
    if (seenNodes.has(node)) return;
    if (seenNodes.size >= MaxEngineNodes)
      throw new Error(
        `TALA AddClusters unique node count exceeds limit ${MaxEngineNodes}`,
      );
    seenNodes.add(node);
    orderedNodes.push(node);
  };
  for (const container of containerOrder) {
    addNode(container);
    for (const child of g.Containers.get(container) ?? []) addNode(child);
  }
  for (const child of g.Containers.get(null) ?? []) addNode(child);
  const index = new ClusterDiscoveryIndex();
  for (const node of orderedNodes)
    index.infos.set(node, new ClusterDiscoveryInfo(node.Width, node.Height));
  for (const node of orderedNodes) {
    const info = index.infos.get(node)!;
    let hasLoop = false;
    for (const edge of node.Edges) {
      guard.Step();
      if (!index.edgeNodes.has(edge)) index.edgeNodes.set(edge, []);
      index.edgeNodes.get(edge)!.push(node);
      if (edge.IsLoop()) hasLoop = true;
      if (
        edge.FromTableColumnIndex !== null ||
        edge.ToTableColumnIndex !== null
      )
        info.toTableColumn = true;
    }
    index.refreshNeighbors(g, node, guard);
    const leaky = clusterHasLeakyEdgeGuarded(g, node, guard);
    info.noClustering =
      g.Trees.has(node) ||
      node.IsClusterVessel() ||
      g.Sequences.has(node) ||
      node.IsTable() ||
      node.Hierarchy !== null ||
      node.FixedTopLeft !== null ||
      leaky ||
      hasLoop;
  }
  for (let edgeIndex = 0; edgeIndex < g.Edges.length; edgeIndex++) {
    const edge = g.Edges[edgeIndex]!;
    guard.Step();
    if (!index.edgeOrder.has(edge)) index.edgeOrder.set(edge, edgeIndex);
    const from = index.infos.get(edge.From);
    if (from !== undefined) {
      from.edges.push(edge);
      from.edgeSignature.add(edge.From, edge);
    }
    if (edge.To !== edge.From) {
      const to = index.infos.get(edge.To);
      if (to !== undefined) {
        to.edges.push(edge);
        to.edgeSignature.add(edge.To, edge);
      }
    }
  }
  guard.Finish();
  return index;
}
export function clusterIncidentEdges(
  cluster: Cluster,
  infos: Map<Node, ClusterDiscoveryInfo>,
  edgeOrder: Map<Edge, number>,
  guard: WorkGuard,
): Edge[] {
  const unique = new Set<Edge>();
  for (const node of cluster.Nodes) {
    guard.Step();
    const info = infos.get(node);
    if (info === undefined)
      throw new Error('TALA AddClusters cannot find cluster member index');
    for (const edge of info.edges) {
      guard.Step();
      unique.add(edge);
    }
  }
  const edges = [...unique];
  for (let width = 1; width < edges.length; width *= 2) {
    for (const _ of edges) guard.Step();
    if (width > Math.trunc(edges.length / 2)) break;
  }
  edges.sort((a, b) => (edgeOrder.get(a) ?? 0) - (edgeOrder.get(b) ?? 0));
  guard.Finish();
  return edges;
}
