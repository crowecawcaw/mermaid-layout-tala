// Translated from internal/layoutgraph/transaction_snapshot.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
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
} from './records.js';
import { WorkGuard, MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
export function collectRuntimeObjectsContext(
  graph: Graph,
  guard: WorkGuard,
  scope: string,
) {
  const nodes = new Set<Node>(),
    nodeQueue: Node[] = [];
  const addNode = (value: Node | null): void => {
    guard.Step();
    if (value === null || nodes.has(value)) return;
    if (nodes.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} node snapshot exceeds limit ${MaxEngineNodes}`,
      );
    nodes.add(value);
    nodeQueue.push(value);
  };
  const edges = new Set<Edge>(),
    edgeQueue: Edge[] = [];
  const addEdge = (value: Edge | null): void => {
    guard.Step();
    if (value === null || edges.has(value)) return;
    if (edges.size >= MaxEngineEdges)
      throw new Error(
        `TALA ${scope} edge snapshot exceeds limit ${MaxEngineEdges}`,
      );
    edges.add(value);
    edgeQueue.push(value);
  };
  const clusters = new Set<Cluster>(),
    clusterQueue: Cluster[] = [];
  const addCluster = (value: Cluster | null): void => {
    guard.Step();
    if (value === null || clusters.has(value)) return;
    if (clusters.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} cluster snapshot exceeds limit ${MaxEngineNodes}`,
      );
    clusters.add(value);
    clusterQueue.push(value);
  };
  const sequences = new Set<Sequence>(),
    sequenceQueue: Sequence[] = [];
  const addSequence = (value: Sequence | null): void => {
    guard.Step();
    if (value === null || sequences.has(value)) return;
    if (sequences.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} sequence snapshot exceeds limit ${MaxEngineNodes}`,
      );
    sequences.add(value);
    sequenceQueue.push(value);
  };
  const trees = new Set<Tree>(),
    treeQueue: Tree[] = [];
  const addTree = (value: Tree | null): void => {
    guard.Step();
    if (value === null || trees.has(value)) return;
    if (trees.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} tree snapshot exceeds limit ${MaxEngineNodes}`,
      );
    trees.add(value);
    treeQueue.push(value);
  };
  const edgeAbductions = new Set<EdgeAbduction>(),
    abductionQueue: EdgeAbduction[] = [];
  const addEdgeAbduction = (value: EdgeAbduction | null): void => {
    guard.Step();
    if (value === null || edgeAbductions.has(value)) return;
    if (edgeAbductions.size >= MaxEngineEdges)
      throw new Error(
        `TALA ${scope} edge-abduction snapshot exceeds limit ${MaxEngineEdges}`,
      );
    edgeAbductions.add(value);
    abductionQueue.push(value);
  };
  const herds = new Set<HerdAssignment>(),
    herdQueue: HerdAssignment[] = [];
  const addHerd = (value: HerdAssignment | null): void => {
    guard.Step();
    if (value === null || herds.has(value)) return;
    if (herds.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} herd snapshot exceeds limit ${MaxEngineNodes}`,
      );
    herds.add(value);
    herdQueue.push(value);
  };
  const hierarchies = new Set<Hierarchy>(),
    hierarchyQueue: Hierarchy[] = [];
  const addHierarchy = (value: Hierarchy | null): void => {
    guard.Step();
    if (value === null || hierarchies.has(value)) return;
    if (hierarchies.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${scope} hierarchy snapshot exceeds limit ${MaxEngineNodes}`,
      );
    hierarchies.add(value);
    hierarchyQueue.push(value);
  };
  for (const node of graph.Nodes) {
    addNode(node);
  }
  for (const edge of graph.Edges) {
    addEdge(edge);
  }
  for (const [container, children] of graph.Containers) {
    addNode(container);
    for (const child of children) {
      addNode(child);
    }
  }
  for (const [vessel, cluster] of graph.Clusters) {
    addNode(vessel);
    addCluster(cluster);
  }
  for (const [vessel, sequence] of graph.Sequences) {
    addNode(vessel);
    addSequence(sequence);
  }
  for (const [node, nodeTrees] of graph.Trees) {
    addNode(node);
    for (const tree of nodeTrees) {
      addTree(tree);
    }
  }
  for (const [node, tree] of graph.NodeToTree) {
    addNode(node);
    addTree(tree);
  }
  for (const [hub, hubNodes] of graph.Hubs) {
    addNode(hub);
    for (const node of hubNodes) {
      addNode(node);
    }
  }
  for (const [node, siblings] of graph.CommonUncleSiblings) {
    addNode(node);
    for (const sibling of siblings) {
      addNode(sibling);
    }
  }
  for (const node of graph.Directions.keys()) {
    addNode(node);
  }

  let nodeIndex = 0,
    edgeIndex = 0,
    clusterIndex = 0,
    sequenceIndex = 0;
  let treeIndex = 0,
    abductionIndex = 0,
    herdIndex = 0,
    hierarchyIndex = 0;
  while (
    nodeIndex < nodeQueue.length ||
    edgeIndex < edgeQueue.length ||
    clusterIndex < clusterQueue.length ||
    sequenceIndex < sequenceQueue.length ||
    treeIndex < treeQueue.length ||
    abductionIndex < abductionQueue.length ||
    herdIndex < herdQueue.length ||
    hierarchyIndex < hierarchyQueue.length
  ) {
    switch (true) {
      case nodeIndex < nodeQueue.length: {
        const node = nodeQueue[nodeIndex]!;
        nodeIndex++;
        addNode(node.Container);
        for (const near of node.Nears.keys()) {
          addNode(near);
        }
        for (const neighbor of node.LongDistanceNeighborRequirements.keys()) {
          addNode(neighbor);
        }
        for (const edge of node.Edges) {
          addEdge(edge);
        }
        addCluster(node.Cluster);
        addSequence(node.Sequence);
        addHerd(node.HerdAssignment);
        addHierarchy(node.Hierarchy);

        break;
      }
      case edgeIndex < edgeQueue.length: {
        const edge = edgeQueue[edgeIndex]!;
        edgeIndex++;
        addNode(edge.From);
        addNode(edge.To);

        break;
      }
      case clusterIndex < clusterQueue.length: {
        const cluster = clusterQueue[clusterIndex]!;
        clusterIndex++;
        addNode(cluster.Vessel);
        addNode(cluster.Container);
        for (const node of cluster.Nodes) {
          addNode(node);
        }
        for (const abduction of cluster.EdgeAbductions) {
          addEdgeAbduction(abduction);
        }

        break;
      }
      case sequenceIndex < sequenceQueue.length: {
        const sequence = sequenceQueue[sequenceIndex]!;
        sequenceIndex++;
        addNode(sequence.Vessel);
        addNode(sequence.Container);
        for (const node of sequence.Nodes) {
          addNode(node);
        }
        for (const abduction of sequence.EdgeAbductions) {
          addEdgeAbduction(abduction);
        }

        break;
      }
      case treeIndex < treeQueue.length: {
        const tree = treeQueue[treeIndex]!;
        treeIndex++;
        addNode(tree.Node);
        addEdge(tree.SentinelEdge);
        addTree(tree.Parent);
        for (const child of tree.Children) {
          addTree(child);
        }

        break;
      }
      case abductionIndex < abductionQueue.length: {
        const abduction = abductionQueue[abductionIndex]!;
        abductionIndex++;
        addEdge(abduction.Edge);
        addNode(abduction.OriginallyFrom);
        addNode(abduction.OriginallyTo);
        addNode(abduction.CurrentFrom);
        addNode(abduction.CurrentTo);

        break;
      }
      case herdIndex < herdQueue.length: {
        const herd = herdQueue[herdIndex]!;
        herdIndex++;
        for (const node of herd.oppositeSidePaired.keys()) {
          addNode(node);
        }
        for (const node of herd.sameSidePaired.keys()) {
          addNode(node);
        }

        break;
      }
      case hierarchyIndex < hierarchyQueue.length: {
        const hierarchy = hierarchyQueue[hierarchyIndex]!;
        hierarchyIndex++;
        for (const node of hierarchy.Levels().keys()) {
          addNode(node);
        }
        break;
      }
    }
  }
  return {
    nodes,
    nodeOrder: nodeQueue,
    edges,
    clusters,
    sequences,
    trees,
    edgeAbductions,
    herds,
    hierarchies,
  };
}
