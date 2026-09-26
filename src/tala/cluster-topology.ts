import { TalaGraph, TalaNode, type TalaEdge } from './graph.js';
import { TalaCluster, type ClusterArrangement } from './cluster-geometry.js';

export interface ClusterSpecification {
  nodes: readonly string[];
  arrangement: ClusterArrangement;
  padding: number;
  vesselId: string;
  fixedSize?: boolean;
}

interface GraphTopologySnapshot {
  nodes: TalaNode[];
  containers: Map<TalaNode | null, TalaNode[]>;
  endpoints: Map<TalaEdge, { from: TalaNode; to: TalaNode }>;
  adjacency: Map<TalaNode, TalaEdge[]>;
  parents: Map<TalaNode, TalaNode | null>;
  children: Map<TalaNode, TalaNode[]>;
  cellSize: number;
}

/** Upstream AddCluster/abductClusterEdges, with a restorable topology snapshot. */
export function activateFlatClusters(graph: TalaGraph,
  specifications: readonly ClusterSpecification[]): { clusters: TalaCluster[]; restore(): void } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const assigned = new Set<TalaNode>();
  const snapshot: GraphTopologySnapshot = {
    nodes: [...graph.nodes],
    containers: new Map([...graph.containers].map(([container, nodes]) => [container, [...nodes]])),
    endpoints: new Map(graph.edges.map((edge) => [edge, { from: edge.from, to: edge.to }])),
    adjacency: new Map(graph.nodes.map((node) => [node, [...node.edges]])),
    parents: new Map(graph.nodes.map((node) => [node, node.parent])),
    children: new Map(graph.nodes.map((node) => [node, [...node.children]])),
    cellSize: graph.cellSize,
  };
  const clusters: TalaCluster[] = [];
  const vesselFor = new Map<TalaNode, TalaNode>();
  for (const specification of specifications) {
    if (byId.has(specification.vesselId)) throw new Error(`duplicate vessel ID ${specification.vesselId}`);
    const members = specification.nodes.map((id) => {
      const node = byId.get(id);
      if (!node || assigned.has(node)) throw new Error(`invalid cluster member ${id}`);
      assigned.add(node);
      return node;
    });
    if (members.length < 2 || members.some((node) => node.parent !== members[0]!.parent)) {
      throw new Error('cluster members must share a container');
    }
    const vessel = new TalaNode({ id: specification.vesselId, width: 1, height: 1 });
    vessel.parent = members[0]!.parent;
    const cluster = new TalaCluster(vessel, members, specification.arrangement,
      specification.padding, specification.fixedSize ?? members.some((node) => node.aspectRatio1));
    clusters.push(cluster);
    byId.set(vessel.id, vessel);
    for (const member of members) vesselFor.set(member, vessel);
  }

  graph.nodes.splice(0, graph.nodes.length, ...snapshot.nodes.filter((node) => !assigned.has(node)),
    ...clusters.map((cluster) => cluster.vessel));
  for (const cluster of clusters) {
    const parent = cluster.vessel.parent;
    const siblings = graph.containers.get(parent) ?? [];
    graph.containers.set(parent, [...siblings.filter((node) => !assigned.has(node)), cluster.vessel]);
    if (parent) parent.children.splice(0, parent.children.length,
      ...parent.children.filter((node) => !assigned.has(node)), cluster.vessel);
    for (const member of cluster.nodes) member.parent = null;
  }
  for (const edge of graph.edges) {
    const fromVessel = vesselFor.get(edge.from), toVessel = vesselFor.get(edge.to);
    if (fromVessel) {
      const cluster = clusters.find((item) => item.vessel === fromVessel)!;
      cluster.edgeAbductions.push({ edge, originallyFrom: edge.from,
        currentFrom: fromVessel, currentTo: edge.to });
      edge.from = fromVessel;
    }
    if (toVessel) {
      const cluster = clusters.find((item) => item.vessel === toVessel)!;
      cluster.edgeAbductions.push({ edge, originallyTo: edge.to,
        currentFrom: edge.from, currentTo: toVessel });
      edge.to = toVessel;
    }
  }
  for (const node of [...snapshot.nodes, ...clusters.map((cluster) => cluster.vessel)]) node.edges.splice(0);
  for (const edge of graph.edges) {
    edge.from.edges.push(edge);
    if (edge.to !== edge.from) edge.to.edges.push(edge);
  }
  let restored = false;
  return { clusters, restore(): void {
    if (restored) return;
    for (const cluster of clusters) cluster.arrangeNodes();
    graph.nodes.splice(0, graph.nodes.length, ...snapshot.nodes);
    graph.containers.clear();
    for (const [container, nodes] of snapshot.containers) graph.containers.set(container, [...nodes]);
    for (const [node, parent] of snapshot.parents) node.parent = parent;
    for (const [node, children] of snapshot.children) node.children.splice(0, node.children.length, ...children);
    for (const [edge, endpoints] of snapshot.endpoints) {
      edge.from = endpoints.from;
      edge.to = endpoints.to;
    }
    for (const [node, edges] of snapshot.adjacency) node.edges.splice(0, node.edges.length, ...edges);
    for (const cluster of clusters) cluster.vessel.edges.splice(0);
    graph.cellSize = snapshot.cellSize;
    restored = true;
  } };
}
