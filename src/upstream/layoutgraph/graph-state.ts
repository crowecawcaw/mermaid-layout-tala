// Snapshot and rollback portions of internal/layoutgraph/transaction.go and
// transaction_snapshot.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import type {
  Cluster,
  Sequence,
  Tree,
  EdgeAbduction,
  HerdAssignment,
  Hierarchy,
  ClusterArrangement,
} from './records.js';
import type { Orientation } from '../geo/orientation.js';
import { WorkGuard, MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
import { sliceCapacity } from './topology-preflight.js';
import { collectRuntimeObjectsContext } from './runtime-objects.js';
import {
  snapshotPointer,
  captureNode,
  captureEdge,
  captureGraph,
  captureGroup,
  captureTree,
  captureHerd,
  captureHierarchy,
} from './transaction-snapshot.js';
interface Snapshot<T> {
  restore(target: T): void;
}
export interface GraphStateSnapshotOptions {
  CaptureTopology: boolean;
  CaptureEdgeRoutes: boolean;
}
export class GraphState {
  nodeGeometry = new Map<
    Node,
    {
      topLeft: ReturnType<typeof snapshotPointer<NonNullable<Node['TopLeft']>>>;
      width: number;
      height: number;
    }
  >();
  originalNodes: Node[] = [];
  originalNodesRef: Node[] = [];
  hasFixedTopLeft = false;
  clusterArrangements = new Map<Cluster, ClusterArrangement>();
  clusterDesired = new Map<Cluster, ClusterArrangement>();
  clusterPaddings = new Map<Cluster, number>();
  edgeGeometry = new Map<Edge, Snapshot<Edge>>();
  treeOrientations = new Map<Tree, Orientation>();
  existingOverlaps = new Map<Node, Set<Node>>();
  existingExactOverlaps = new Map<Node, Set<Node>>();
  graph: Snapshot<Graph> | null = null;
  nodes = new Map<Node, Snapshot<Node>>();
  edges = new Map<Edge, Snapshot<Edge>>();
  clusters = new Map<Cluster, Snapshot<Cluster>>();
  sequences = new Map<Sequence, Snapshot<Sequence>>();
  trees = new Map<Tree, Snapshot<Tree>>();
  edgeAbductions = new Map<EdgeAbduction, EdgeAbduction>();
  herds = new Map<HerdAssignment, Snapshot<HerdAssignment>>();
  hierarchies = new Map<Hierarchy, Snapshot<Hierarchy>>();
  captureTopology: boolean;
  captureEdgeRoutes: boolean;
  constructor(options: GraphStateSnapshotOptions) {
    this.captureTopology = options.CaptureTopology;
    this.captureEdgeRoutes = options.CaptureEdgeRoutes;
  }
  UpdateWithWorkGuard(g: Graph, guard: WorkGuard): void {
    this.updateContext(g, guard);
  }
  updateContext(g: Graph, guard: WorkGuard): void {
    if (g == null) throw new Error('TALA transaction graph is nil');
    if (guard == null)
      throw new Error('TALA transaction requires a work guard');
    if (g.Nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA transaction node count exceeds limit ${MaxEngineNodes}`,
      );
    if (g.Edges.length > MaxEngineEdges)
      throw new Error(
        `TALA transaction edge count exceeds limit ${MaxEngineEdges}`,
      );
    const collections: [string, number][] = [
      ['container', g.Containers.size],
      ['cluster', g.Clusters.size],
      ['sequence', g.Sequences.size],
      ['tree', g.Trees.size],
      ['node-tree', g.NodeToTree.size],
      ['hub', g.Hubs.size],
      ['direction', g.Directions.size],
      ['sibling', g.CommonUncleSiblings.size],
    ];
    for (const [name, count] of collections)
      if (count > MaxEngineNodes + 1)
        throw new Error(
          `TALA transaction ${name} map exceeds limit ${MaxEngineNodes + 1}`,
        );
    this.nodeGeometry.clear();
    this.hasFixedTopLeft = false;
    this.clusterArrangements.clear();
    this.clusterDesired.clear();
    this.clusterPaddings.clear();
    this.originalNodesRef = g.Nodes;
    this.originalNodes = g.Nodes.slice();
    const recordNode = (n: Node | null): boolean => {
      if (n === null || this.nodeGeometry.has(n)) return false;
      if (this.nodeGeometry.size >= MaxEngineNodes)
        throw new Error(
          `TALA transaction unique node snapshot exceeds limit ${MaxEngineNodes}`,
        );
      guard.Step();
      this.nodeGeometry.set(n, {
        topLeft: snapshotPointer(n.TopLeft),
        width: n.Width,
        height: n.Height,
      });
      this.hasFixedTopLeft = this.hasFixedTopLeft || n.FixedTopLeft !== null;
      return true;
    };
    const recordDescendants = (root: Node | null): void => {
      const queue: (Node | null)[] = [root];
      while (queue.length > 0) {
        const node = queue.pop()!;
        if (!recordNode(node)) continue;
        for (const _ of g.Containers.get(node) ?? []) guard.Step();
        queue.push(...(g.Containers.get(node) ?? []));
      }
    };
    for (const node of g.Nodes) recordDescendants(node);
    for (const [container, children] of g.Containers) {
      guard.Step();
      recordDescendants(container);
      for (const child of children) recordDescendants(child);
    }
    for (const c of g.Clusters.values()) {
      guard.Step();
      if (c === null) continue;
      this.clusterArrangements.set(c, c.Arrangement);
      this.clusterDesired.set(c, c.DesiredArrangement);
      this.clusterPaddings.set(c, c.Padding);
      recordDescendants(c.Vessel);
      recordDescendants(c.Container);
      for (const node of c.Nodes) recordDescendants(node);
    }
    for (const s of g.Sequences.values()) {
      guard.Step();
      if (s === null) continue;
      recordDescendants(s.Vessel);
      recordDescendants(s.Container);
      for (const node of s.Nodes) recordDescendants(node);
    }
    if (this.captureTopology) this.captureRuntimeStateContext(g, guard);
    else this.captureGeometryStateContext(g, guard);
    guard.Finish();
  }
  captureGeometryStateContext(graph: Graph, guard: WorkGuard): void {
    if (this.captureEdgeRoutes) {
      const edges = new Set<Edge>();
      for (const edge of graph.Edges) {
        guard.Step();
        if (edge === null)
          throw new Error('TALA geometry snapshot contains a nil edge');
        edges.add(edge);
      }
      for (const node of this.nodeGeometry.keys()) {
        guard.Step();
        for (const edge of node.Edges) {
          guard.Step();
          if (edge !== null) edges.add(edge);
        }
      }
      this.edgeGeometry = new Map();
      for (const edge of edges) {
        guard.Step();
        for (let i = 0; i < sliceCapacity(edge.Points); i++) guard.Step();
        this.edgeGeometry.set(edge, captureEdge(edge));
      }
    } else this.edgeGeometry = new Map();
    this.treeOrientations = new Map();
    for (const tree of graph.NodeToTree.values()) {
      guard.Step();
      if (tree !== null) this.treeOrientations.set(tree, tree.Orientation);
    }
    guard.Finish();
  }
  captureRuntimeStateContext(graph: Graph, guard: WorkGuard): void {
    const objects = collectRuntimeObjectsContext(
      graph,
      guard,
      'transaction runtime',
    );
    guard.Step();
    this.graph = captureGraph(graph);
    this.nodes = new Map();
    for (const node of objects.nodes) {
      guard.Step();
      this.nodes.set(node, captureNode(node));
    }
    this.edges = new Map();
    for (const edge of objects.edges) {
      guard.Step();
      for (let i = 0; i < sliceCapacity(edge.Points); i++) guard.Step();
      this.edges.set(edge, captureEdge(edge));
    }
    this.clusters = new Map();
    for (const cluster of objects.clusters) {
      guard.Step();
      this.clusters.set(cluster, captureGroup(cluster));
    }
    this.sequences = new Map();
    for (const sequence of objects.sequences) {
      guard.Step();
      this.sequences.set(sequence, captureGroup(sequence));
    }
    this.trees = new Map();
    for (const tree of objects.trees) {
      guard.Step();
      this.trees.set(tree, captureTree(tree));
    }
    this.edgeAbductions = new Map();
    for (const abduction of objects.edgeAbductions) {
      guard.Step();
      this.edgeAbductions.set(abduction, { ...abduction });
    }
    this.herds = new Map();
    for (const herd of objects.herds) {
      guard.Step();
      this.herds.set(herd, captureHerd(herd));
    }
    this.hierarchies = new Map();
    for (const hierarchy of objects.hierarchies) {
      guard.Step();
      this.hierarchies.set(hierarchy, captureHierarchy(hierarchy));
    }
    guard.Finish();
  }
  OwnedNodes(g: Graph, guard: WorkGuard): Set<Node> {
    const owned = new Set<Node>();
    for (const node of g.Nodes) {
      guard.Step();
      owned.add(node);
    }
    for (const node of this.nodes.keys()) {
      guard.Step();
      if (node.Graph === g) owned.add(node);
    }
    return owned;
  }
}
export function NewGraphStateSnapshot(
  options: GraphStateSnapshotOptions,
): GraphState {
  return new GraphState(options);
}
// Direct Transaction.Rollback body, factored for the tree preprocessing stage.
export function RollbackGraphState(graph: Graph, state: GraphState): void {
  if (state.captureTopology) {
    state.graph!.restore(graph);
    for (const [cluster, snapshot] of state.clusters) snapshot.restore(cluster);
    for (const [sequence, snapshot] of state.sequences)
      snapshot.restore(sequence);
    for (const [tree, snapshot] of state.trees) snapshot.restore(tree);
    for (const [abduction, snapshot] of state.edgeAbductions)
      Object.assign(abduction, snapshot);
    for (const [herd, snapshot] of state.herds) snapshot.restore(herd);
    for (const [hierarchy, snapshot] of state.hierarchies)
      snapshot.restore(hierarchy);
    for (const [edge, snapshot] of state.edges) snapshot.restore(edge);
    for (const [node, snapshot] of state.nodes) snapshot.restore(node);
    return;
  }
  for (const [node, geometry] of state.nodeGeometry) {
    node.TopLeft = geometry.topLeft.restore();
    node.Width = geometry.width;
    node.Height = geometry.height;
  }
  for (const [cluster, arrangement] of state.clusterArrangements) {
    cluster.Arrangement = arrangement;
    cluster.DesiredArrangement = state.clusterDesired.get(cluster)!;
    cluster.Padding = state.clusterPaddings.get(cluster)!;
  }
  for (const [edge, snapshot] of state.edgeGeometry) snapshot.restore(edge);
  for (const [tree, orientation] of state.treeOrientations)
    tree.Orientation = orientation;
  for (
    let i = 0;
    i < Math.min(state.originalNodesRef.length, state.originalNodes.length);
    i++
  )
    state.originalNodesRef[i] = state.originalNodes[i]!;
  state.originalNodesRef.length = state.originalNodes.length;
  graph.Nodes = state.originalNodesRef;
}
