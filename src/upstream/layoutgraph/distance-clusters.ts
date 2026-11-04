// Translated Nodes.clustersWithWorkGuard from internal/layoutgraph/node.go.
// D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { WorkGuard } from '../limits/work.js';
import { PrecisionCompare } from '../geo/math.js';
import { distance } from './node-spatial.js';
import { sortByID } from '../proximity/nears.js';
export function distanceClustersWithWorkGuard(
  nodes: Node[],
  distanceThreshold: number,
  guard: WorkGuard | null,
): Node[][] | null {
  const charge = (units: number) => guard?.Add(BigInt(units)),
    finish = () => guard?.Finish(),
    chargeSort = (length: number) => {
      for (let width = 1; width < length; width *= 2) {
        charge(length);
        if (width > Math.trunc(length / 2)) break;
      }
    };
  const nodeToCluster = new Map<Node, number>();
  let nextGeneratedClusterID = 0;
  const createCluster = (node: Node) => {
    if (!nodeToCluster.has(node))
      nodeToCluster.set(node, nextGeneratedClusterID++);
  };
  const seedNodes: Node[] = [],
    maybeAddSeedNodes = (n: Node, adj: Node) => {
      if (
        PrecisionCompare(distance(n, adj, true), distanceThreshold, 0.0001) > 0
      )
        seedNodes.push(n, adj);
    };
  for (const n of nodes) {
    charge(1 + n.Edges.length + n.Nears.size);
    for (const edge of n.Edges) maybeAddSeedNodes(n, n.Adjacent(edge));
    chargeSort(n.Nears.size);
    for (let near of n.orderedNears()) {
      if (near.Cluster !== null) near = near.Cluster.Vessel!;
      else if (near.Sequence !== null) near = near.Sequence.Vessel!;
      else {
        let tree = n.Graph!.NodeToTree.get(near);
        if (tree !== undefined) {
          while (tree.Parent !== null) {
            guard?.Step();
            tree = tree.Parent;
          }
          near =
            tree.SentinelEdge!.From === tree.Node
              ? tree.SentinelEdge!.To
              : tree.SentinelEdge!.From;
        }
      }
      if (near.Container !== n.Container) continue;
      maybeAddSeedNodes(n, near);
    }
  }
  if (seedNodes.length < 2) {
    finish();
    return null;
  }
  const mergeNodesInPerimeter = (n: Node): void => {
    charge(nodes.length);
    const clusterID = nodeToCluster.get(n) ?? 0;
    for (const other of nodes) {
      if (other === n || other.FixedTopLeft !== null) continue;
      if (
        PrecisionCompare(distance(n, other, true), distanceThreshold, 0.0001) >
        0
      )
        continue;
      const otherID = nodeToCluster.get(other);
      if (otherID !== undefined && otherID === clusterID) continue;
      nodeToCluster.set(other, nodeToCluster.get(n) ?? 0);
      if (otherID === undefined) mergeNodesInPerimeter(other);
    }
  };
  charge(seedNodes.length);
  for (const node of seedNodes) {
    if (node.FixedTopLeft !== null) continue;
    createCluster(node);
    mergeNodesInPerimeter(node);
  }
  charge(nodes.length);
  if (
    !nodes.some((n) => n.FixedTopLeft !== null) &&
    nodeToCluster.size !== nodes.length
  )
    throw new Error(
      `Clustered nodes: ${nodeToCluster.size}. Total: ${nodes.length}`,
    );
  const clusterMapping = new Map<number, Node[]>();
  charge(nodeToCluster.size);
  for (const [node, id] of nodeToCluster) {
    if (!clusterMapping.has(id)) clusterMapping.set(id, []);
    clusterMapping.get(id)!.push(node);
  }
  for (const cluster of clusterMapping.values()) {
    chargeSort(cluster.length);
    sortByID(cluster);
  }
  charge(clusterMapping.size);
  const clusterIDs = [...clusterMapping.keys()];
  chargeSort(clusterIDs.length);
  clusterIDs.sort((a, b) => a - b);
  charge(clusterIDs.length);
  const clusters = clusterIDs.map((id) => clusterMapping.get(id)!);
  finish();
  return clusters;
}
