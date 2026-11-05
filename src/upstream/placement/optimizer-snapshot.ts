// Translated internal/placement/optimization_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type {
  Cluster,
  HerdAssignment,
  ClusterArrangement,
} from '../layoutgraph/records.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes } from '../limits/work.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import {
  EdgeLengthCacheEntries,
  SnapshotPlacementCosts,
  type PlacementCostSnapshot,
} from '../layoutgraph/placement-cost.js';
import { restoreNodePositions, type NodePositionSnapshot } from './types.js';

type SavedNode = NodePositionSnapshot & { width: number; height: number };
type SavedCluster = {
  cluster: Cluster;
  arrangement: ClusterArrangement;
  desired: ClusterArrangement;
  padding: number;
};
export class OptimizerMutationSnapshot {
  nodes: SavedNode[] = [];
  clusters: SavedCluster[] = [];
  herds: { herd: HerdAssignment; value: HerdAssignment }[] = [];
  costSnapshot: PlacementCostSnapshot | null = null;
  release(): void {
    this.nodes.length = 0;
    this.clusters.length = 0;
    this.herds.length = 0;
    this.costSnapshot = null;
  }
  restore(): void {
    restoreNodePositions(this.nodes);
    for (const n of this.nodes) {
      n.node.Width = n.width;
      n.node.Height = n.height;
    }
    for (const c of this.clusters) {
      c.cluster.Arrangement = c.arrangement;
      c.cluster.DesiredArrangement = c.desired;
      c.cluster.Padding = c.padding;
    }
    for (const h of this.herds) Object.assign(h.herd, h.value);
    this.costSnapshot!.Restore();
  }
}
export function captureOptimizerMutationStateInto(
  graph: Graph | null,
  guard: OptimizationWorkGuard,
  snapshot: OptimizerMutationSnapshot,
): OptimizerMutationSnapshot {
  snapshot.release();
  if (graph === null)
    throw new Error(`TALA ${guard.Location()} requires a graph`);
  if (graph.Nodes.length > MaxEngineNodes)
    throw new Error(
      `TALA ${guard.Location()} snapshot node count exceeds limit ${MaxEngineNodes}`,
    );
  if (
    graph.Containers.size > MaxEngineNodes + 1 ||
    graph.Clusters.size > MaxEngineNodes ||
    graph.Sequences.size > MaxEngineNodes
  )
    throw new Error(
      `TALA ${guard.Location()} optimizer topology maps exceed node limit ${MaxEngineNodes}`,
    );
  const entries = EdgeLengthCacheEntries(graph);
  if (entries > maxEngineTopologyReferences)
    throw new Error(
      `TALA ${guard.Location()} edge-length cache entries exceed limit ${maxEngineTopologyReferences}`,
    );
  for (let i = 0; i < entries; i++) guard.Step();
  const costs = SnapshotPlacementCosts(graph);
  guard.Finish();
  snapshot.costSnapshot = costs;
  const seenNodes = new Set<Node>();
  const enqueue = (node: Node): void => {
    guard.Step();
    if (node == null)
      throw new Error(`TALA ${guard.Location()} found a nil graph node`);
    if (seenNodes.has(node)) return;
    if (seenNodes.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} snapshot node count exceeds limit ${MaxEngineNodes}`,
      );
    seenNodes.add(node);
    snapshot.nodes.push({
      node,
      pointer: node.TopLeft,
      x: node.TopLeft?.X ?? 0,
      y: node.TopLeft?.Y ?? 0,
      width: node.Width,
      height: node.Height,
    });
  };
  for (const node of graph.Nodes) enqueue(node);
  const visit = (nodes: Node[], kind: string): void => {
    if (nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} ${kind} child references exceed node limit ${MaxEngineNodes}`,
      );
    for (const node of nodes) enqueue(node);
  };
  for (let i = 0; i < snapshot.nodes.length; i++) {
    const node = snapshot.nodes[i]!.node;
    visit(graph.Containers.get(node) ?? [], 'container');
    const cluster = graph.Clusters.get(node);
    if (cluster !== undefined) visit(cluster.Nodes, 'cluster');
    const sequence = graph.Sequences.get(node);
    if (sequence !== undefined) visit(sequence.Nodes, 'sequence');
  }
  const clusters = new Set<Cluster>();
  for (const cluster of graph.Clusters.values()) {
    guard.Step();
    if (cluster == null || clusters.has(cluster)) continue;
    clusters.add(cluster);
    snapshot.clusters.push({
      cluster,
      arrangement: cluster.Arrangement,
      desired: cluster.DesiredArrangement,
      padding: cluster.Padding,
    });
  }
  const herds = new Set<HerdAssignment>();
  for (const saved of snapshot.nodes) {
    guard.Step();
    const herd = saved.node.HerdAssignment;
    if (herd === null || herds.has(herd)) continue;
    herds.add(herd);
    snapshot.herds.push({ herd, value: { ...herd } as HerdAssignment });
  }
  return snapshot;
}
export function captureOptimizerMutationState(
  graph: Graph | null,
  guard: OptimizationWorkGuard,
): OptimizerMutationSnapshot {
  return captureOptimizerMutationStateInto(
    graph,
    guard,
    new OptimizerMutationSnapshot(),
  );
}
