// Translated from internal/grouping/clusters.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { reconnectEdge } from '../layoutgraph/edge-topology.js';
import {
  Cluster,
  Tree,
  FlipArrangement,
  type ClusterArrangement,
  type EdgeAbduction,
} from '../layoutgraph/records.js';
import { NodeGap } from '../layoutgraph/geometry-policy.js';
import {
  clusterResizeWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { containerPadding } from '../layoutgraph/node-geometry.js';
import { distanceTo } from '../layoutgraph/node-spatial.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import {
  NewGraphStateSnapshot,
  RollbackGraphState,
} from '../layoutgraph/graph-state.js';
import { Round } from '../geo/math.js';
import { Point } from '../geo/point.js';
import { PADDING } from '../label/label.js';
import { GoRandom } from '../../random.js';
import { Slice } from '../gosort/slice.js';
import {
  buildClusterDiscoveryIndex,
  clusterIsDescendantOfGuarded,
  clusterIncidentEdges,
} from './cluster-discovery.js';
export function averageClusterDimensions(cluster: Cluster): [number, number] {
  let width = 0,
    height = 0;
  for (const node of cluster.Nodes) {
    width += node.Width;
    height += node.Height;
  }
  return [
    Round(width / cluster.Nodes.length),
    Round(height / cluster.Nodes.length),
  ];
}
export function AssignArrangement(
  cluster: Cluster,
  isConnectedToSequence: boolean,
  random: GoRandom,
): ClusterArrangement {
  const [w, h] = averageClusterDimensions(cluster);
  if (isConnectedToSequence) return 'Row';
  if (w > h) return 'Column';
  if (w < h) return 'Row';
  return random.float64() > 0.5 ? 'Column' : 'Row';
}
export function PaddingBetween(
  cluster: Cluster,
  considerPositions: boolean,
): number {
  const [w, h] = averageClusterDimensions(cluster);
  let hasIcon = false,
    maxLabelWidth = 0,
    maxLabelHeight = 0;
  for (const node of cluster.Nodes) {
    hasIcon = hasIcon || node.Icon !== null;
    if (node.Label !== null) {
      maxLabelWidth = Math.max(maxLabelWidth, node.Label.Width);
      maxLabelHeight = Math.max(maxLabelHeight, node.Label.Height);
    }
  }
  let given: number;
  if (cluster.Arrangement === 'Row') {
    given = Math.max(NodeGap, Math.ceil(w) * 0.1);
    if (hasIcon) given = Math.max(given, 2 * PADDING + maxLabelWidth);
  } else {
    given = Math.max(NodeGap, Math.ceil(h) * 0.1);
    if (hasIcon) given = Math.max(given, 2 * PADDING + maxLabelHeight);
  }
  if (considerPositions) {
    let total = 0;
    for (let i = 0; i < cluster.Nodes.length - 1; i++)
      total += distanceTo(cluster.Nodes[i]!, cluster.Nodes[i + 1]!, true);
    const positionedPadding = total / (cluster.Nodes.length - 1);
    if (positionedPadding > 0) return Round(Math.min(positionedPadding, given));
  }
  return Round(given);
}
export function CreateVessel(cluster: Cluster, vesselID: bigint): Node {
  let minX = Infinity,
    minY = Infinity;
  for (const node of cluster.Nodes)
    if (node.TopLeft !== null) {
      minX = Math.min(minX, node.TopLeft.X);
      minY = Math.min(minY, node.TopLeft.Y);
    }
  const vessel = new Node(vesselID, 0, 0);
  vessel.SetClusterVessel(true);
  clusterResizeWithWork(cluster, vessel, unmeteredGroupGeometry);
  if (cluster.Arrangement === 'Row') {
    if (minX !== Infinity && minY !== Infinity) {
      Slice(cluster.Nodes, (a, b) => a.TopLeft!.X < b.TopLeft!.X);
      vessel.TopLeft = new Point(minX, minY);
    }
  }
  if (cluster.Arrangement === 'Column') {
    if (minX !== Infinity && minY !== Infinity) {
      Slice(cluster.Nodes, (a, b) => a.TopLeft!.Y < b.TopLeft!.Y);
      vessel.TopLeft = new Point(minX, minY);
    }
  }
  return vessel;
}
export function AddCluster(graph: Graph, cluster: Cluster): void {
  graph.AddNewNodeToContainer(cluster.Container, cluster.Vessel!);
  for (const node of cluster.Nodes) node.Cluster = cluster;
  const updated: Node[] = [];
  for (const child of graph.Containers.get(cluster.Container) ?? [])
    if (child.Cluster !== cluster) updated.push(child);
  graph.Containers.set(cluster.Container, updated);
  for (const node of cluster.Nodes) {
    graph.RemoveNode(node);
    node.Container = null;
  }
  graph.Clusters.set(cluster.Vessel!, cluster);
}
export function abductClusterEdges(
  cluster: Cluster,
  edges: Edge[],
  guard: WorkGuard,
): void {
  const abductions: EdgeAbduction[] = [];
  for (const edge of edges) {
    guard.Step();
    if (edge.From.Cluster === cluster) {
      const count = edge.From.Edges.length + cluster.Vessel!.Edges.length;
      for (let i = 0; i < count; i++) guard.Step();
      abductions.push({
        Edge: edge,
        OriginallyFrom: edge.From,
        OriginallyTo: null,
        CurrentFrom: cluster.Vessel,
        CurrentTo: edge.To,
      });
      reconnectEdge(edge, cluster.Vessel!, false);
    }
    if (edge.To.Cluster === cluster) {
      const count = edge.To.Edges.length + cluster.Vessel!.Edges.length;
      for (let i = 0; i < count; i++) guard.Step();
      abductions.push({
        Edge: edge,
        OriginallyTo: edge.To,
        OriginallyFrom: null,
        CurrentTo: cluster.Vessel,
        CurrentFrom: edge.From,
      });
      reconnectEdge(edge, cluster.Vessel!, true);
    }
  }
  cluster.EdgeAbductions = abductions;
  guard.Finish();
}
export function AddClusters(
  ctx: Context,
  graph: Graph,
  randomSeed: bigint,
  random: GoRandom,
): void {
  if (graph === null) throw new Error('TALA AddClusters requires a graph');
  if (random === null)
    throw new Error('TALA AddClusters requires a random generator');
  validateEngineGraph(ctx, 'AddClusters', graph);
  const [, guard] = EnsureTransactionWorkGuard(ctx, 'AddClustersTransactions'),
    containerOrder = graph.containerRDFSOrderContext(null, guard);
  const stageState = NewGraphStateSnapshot({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  stageState.UpdateWithWorkGuard(graph, guard);
  let complete = false;
  try {
    graph.Clusters.clear();
    const discoveryIndex = buildClusterDiscoveryIndex(
        graph,
        containerOrder,
        guard,
      ),
      infos = discoveryIndex.infos,
      edgeOrder = discoveryIndex.edgeOrder,
      reservedIDs = new Set<bigint>();
    for (const node of graph.Nodes) {
      guard.Step();
      reservedIDs.add(node.ID);
    }
    for (const vessel of graph.SequenceOrder()) {
      guard.Step();
      reservedIDs.add(vessel.ID);
      for (const node of graph.Sequences.get(vessel)!.Nodes) {
        guard.Step();
        reservedIDs.add(node.ID);
      }
    }
    const seenTrees = new Set<Tree>();
    for (const sentinel of graph.TreeOrder()) {
      guard.Step();
      if (sentinel !== null) reservedIDs.add(sentinel.ID);
      const stack = [...(graph.Trees.get(sentinel) ?? [])];
      while (stack.length > 0) {
        guard.Step();
        const tree = stack.pop()!;
        if (tree === null || seenTrees.has(tree)) continue;
        seenTrees.add(tree);
        if (tree.Node !== null) reservedIDs.add(tree.Node.ID);
        stack.push(...tree.Children);
      }
    }
    const nextVesselID = (candidate: bigint): bigint => {
      for (;;) {
        guard.Step();
        if (!reservedIDs.has(candidate)) return candidate;
        candidate = candidate === 9223372036854775807n ? 0n : candidate + 1n;
      }
    };
    const chargeClusterKernel = (cluster: Cluster): void => {
      for (const _ of cluster.Nodes)
        for (const __ of cluster.Nodes) guard.Step();
      for (let width = 1; width < cluster.Nodes.length; width *= 2) {
        for (const _ of cluster.Nodes) guard.Step();
        if (width > Math.trunc(cluster.Nodes.length / 2)) break;
      }
      guard.Finish();
    };
    const maybeCreateCluster = (
      cluster: Cluster,
      arrangement: ClusterArrangement,
    ): boolean => {
      for (const node of cluster.Nodes) {
        guard.Step();
        for (const edge of node.Edges) {
          guard.Step();
          if (clusterIsDescendantOfGuarded(node, node.Adjacent(edge), guard))
            return false;
        }
      }
      const vesselID = nextVesselID(random.int63()),
        clusterEdges = clusterIncidentEdges(cluster, infos, edgeOrder, guard);
      chargeClusterKernel(cluster);
      cluster.Arrangement = arrangement;
      cluster.DesiredArrangement = arrangement;
      cluster.Padding = PaddingBetween(cluster, false);
      cluster.Vessel = CreateVessel(cluster, vesselID);
      AddCluster(graph, cluster);
      guard.Step();
      abductClusterEdges(cluster, clusterEdges, guard);
      discoveryIndex.refreshAfterClusterAbduction(
        graph,
        cluster,
        clusterEdges,
        guard,
      );
      reservedIDs.add(vesselID);
      for (const node of cluster.Nodes) {
        guard.Step();
        reservedIDs.add(node.ID);
      }
      return true;
    };
    const refreshContainerEstimate = (container: Node | null) => {
      if (container === null || !container.IsContainer()) return;
      const info = infos.get(container);
      if (info === undefined)
        throw new Error(
          'TALA AddClusters cannot find container discovery index',
        );
      const padding = containerPadding(graph, container, true);
      let width = 0,
        height = 0;
      for (const child of graph.Containers.get(container) ?? []) {
        guard.Step();
        const childInfo = infos.get(child);
        width += childInfo?.estimatedWidth ?? child.Width;
        height += childInfo?.estimatedHeight ?? child.Height;
      }
      info.estimatedWidth = Math.max(
        container.Width,
        width + padding.left + padding.right,
      );
      info.estimatedHeight = Math.max(
        container.Height,
        height + padding.top + padding.bottom,
      );
      guard.Finish();
    };
    for (const container of [...containerOrder, null]) {
      guard.Step();
      const rng = new GoRandom(randomSeed),
        children = [...(graph.Containers.get(container) ?? [])];
      for (const node of children) {
        guard.Step();
        const info = infos.get(node);
        if (info === undefined)
          throw new Error('TALA AddClusters cannot find node discovery index');
        if (info.noClustering || node.Cluster !== null) continue;
        let connectedToCluster = false;
        for (const edge of node.Edges) {
          guard.Step();
          const adjacent = node.Adjacent(edge);
          if (adjacent !== null && adjacent.IsClusterVessel()) {
            connectedToCluster = true;
            break;
          }
        }
        if (connectedToCluster || info.toTableColumn) continue;
        const clusterNodes = [node];
        let isConnectedToSequence = false;
        for (const otherNode of children) {
          guard.Step();
          if (otherNode === node || otherNode.ShapeType() !== node.ShapeType())
            continue;
          const otherInfo = infos.get(otherNode);
          if (otherInfo === undefined)
            throw new Error(
              'TALA AddClusters cannot find comparison-node discovery index',
            );
          if (
            otherInfo.noClustering ||
            otherNode.Cluster !== null ||
            otherInfo.toTableColumn
          )
            continue;
          if (
            4 * otherInfo.estimatedWidth < info.estimatedWidth ||
            4 * info.estimatedWidth < otherInfo.estimatedWidth ||
            4 * otherInfo.estimatedHeight < info.estimatedHeight ||
            4 * info.estimatedHeight < otherInfo.estimatedHeight
          )
            continue;
          let sameAdjacentNodes =
            info.neighbors.length > 0 &&
            info.neighbors.length === otherInfo.neighbors.length;
          if (sameAdjacentNodes)
            for (const adjacentNode of info.neighbors) {
              guard.Step();
              isConnectedToSequence =
                isConnectedToSequence ||
                (adjacentNode !== null && adjacentNode.Sequence !== null);
              if (!otherInfo.neighborSet.has(adjacentNode)) {
                sameAdjacentNodes = false;
                break;
              }
            }
          if (
            sameAdjacentNodes &&
            info.edgeSignature.matches(otherInfo.edgeSignature)
          )
            clusterNodes.push(otherNode);
        }
        if (clusterNodes.length <= 1) continue;
        const cluster = new Cluster();
        cluster.Nodes = clusterNodes;
        cluster.Container = container;
        cluster.Graph = graph;
        for (const clusterNode of clusterNodes) {
          guard.Step();
          if (clusterNode.Shape.AspectRatio1()) {
            cluster.FixedSize = true;
            break;
          }
        }
        chargeClusterKernel(cluster);
        const initial = AssignArrangement(cluster, isConnectedToSequence, rng);
        if (!maybeCreateCluster(cluster, initial))
          maybeCreateCluster(cluster, FlipArrangement(initial));
      }
      refreshContainerEstimate(container);
    }
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(graph, stageState);
  }
}
