// Translated from internal/grouping/lifecycle.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import {
  clusterArrangeNodesWithWork,
  sequenceArrangeStepsWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { reconnectEdge } from './clusters.js';
function filterInPlace<T>(items: T[], keep: (item: T) => boolean): T[] {
  let write = 0;
  for (let read = 0; read < items.length; read++) {
    const item = items[read]!;
    if (keep(item)) items[write++] = item;
  }
  items.length = write;
  return items;
}
export function ResetClusters(graph: Graph): void {
  if (graph.Clusters.size === 0) return;
  const bulkFilter = graph.Clusters.size > 1;
  let singleRetiredVessel: Node | null = null,
    retiredVesselCount = 0;
  const filter = (keep: (node: Node) => boolean) => {
    graph.Nodes = filterInPlace(graph.Nodes, keep);
    for (const [container, children] of graph.Containers)
      graph.Containers.set(container, filterInPlace(children, keep));
  };
  for (const [vessel, cluster] of graph.Clusters) {
    if (cluster === null) continue;
    for (const abduction of cluster.EdgeAbductions) {
      if (abduction === null || abduction.Edge === null) continue;
      if (abduction.OriginallyFrom !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyFrom, false);
      if (abduction.OriginallyTo !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyTo, true);
    }
    for (const node of cluster.Nodes) {
      if (node !== null && node.Cluster === cluster) node.Cluster = null;
      if (node !== null) node.Nears.delete(vessel);
    }
    if (vessel === null) continue;
    for (const near of vessel.Nears)
      if (near !== null) near.Nears.delete(vessel);
    vessel.Nears = new Set();
    if (bulkFilter) {
      retiredVesselCount++;
      if (retiredVesselCount === 1) singleRetiredVessel = vessel;
    } else filter((node) => node !== vessel);
    vessel.Container = null;
    vessel.Graph = null;
    vessel.SetClusterVessel(false);
  }
  if (!bulkFilter || retiredVesselCount === 0) {
    graph.Clusters.clear();
    return;
  }
  if (retiredVesselCount === 1) {
    filter((node) => node !== singleRetiredVessel);
    graph.Clusters.clear();
    return;
  }
  filter(
    (node) =>
      !(
        node !== null &&
        node.Graph === null &&
        graph.Clusters.get(node) != null
      ),
  );
  graph.Clusters.clear();
}
export function Cleanup(graph: Graph): void {
  for (const key of graph.ClusterOrder()) {
    const cluster = graph.Clusters.get(key)!;
    clusterArrangeNodesWithWork(cluster, unmeteredGroupGeometry);
    for (const node of cluster.Nodes)
      graph.AddNewNodeToContainer(cluster.Container, node);
    for (const abduction of cluster.EdgeAbductions) {
      if (abduction.OriginallyFrom !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyFrom, false);
      if (abduction.OriginallyTo !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyTo, true);
    }
    if (cluster.Vessel!.Nears.size !== 0) {
      for (const near of cluster.Vessel!.orderedNears()) {
        near.Nears.delete(cluster.Vessel!);
        for (const node of cluster.Nodes) near.AddNear(node);
      }
      cluster.Vessel!.Nears = new Set();
    }
    graph.RemoveNode(cluster.Vessel!);
    graph.Containers.set(
      cluster.Container,
      (graph.Containers.get(cluster.Container) ?? []).filter(
        (child) => child !== cluster.Vessel,
      ),
    );
    cluster.Vessel!.Container = null;
    cluster.Vessel!.Graph = null;
  }
  for (const vessel of graph.SequenceOrder()) {
    const sequence = graph.Sequences.get(vessel)!;
    sequenceArrangeStepsWithWork(sequence, unmeteredGroupGeometry);
    for (const node of sequence.Nodes)
      graph.AddNewNodeToContainer(sequence.Container, node);
    for (const abduction of sequence.EdgeAbductions) {
      if (abduction.OriginallyFrom !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyFrom, false);
      if (abduction.OriginallyTo !== null)
        reconnectEdge(abduction.Edge, abduction.OriginallyTo, true);
    }
    if (sequence.Vessel!.Nears.size !== 0) {
      for (const near of sequence.Vessel!.orderedNears()) {
        near.Nears.delete(sequence.Vessel!);
        for (const node of sequence.Nodes) near.AddNear(node);
      }
      sequence.Vessel!.Nears = new Set();
    }
    graph.RemoveNode(vessel);
    graph.Containers.set(
      sequence.Container,
      (graph.Containers.get(sequence.Container) ?? []).filter(
        (child) => child !== vessel,
      ),
    );
    sequence.Vessel!.Container = null;
    sequence.Vessel!.Graph = null;
  }
  for (const node of graph.Nodes) node.HerdAssignment = null;
}
