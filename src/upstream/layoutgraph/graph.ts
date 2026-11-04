// Translated portions of internal/layoutgraph/graph.go and layout.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Orientation } from '../geo/orientation.js';
import { Node } from './node.js';
import { Edge } from './edge.js';
import type { Cluster, Sequence, Tree } from './records.js';
export class Graph {
  IsRootHierarchy = false;
  Nodes: Node[] = [];
  Edges: Edge[] = [];
  CellSize = 0;
  Containers = new Map<Node | null, Node[]>();
  Clusters = new Map<Node, Cluster>();
  Trees = new Map<Node, Tree[]>();
  NodeToTree = new Map<Node, Tree>();
  Hubs = new Map<Node, Node[]>();
  Sequences = new Map<Node, Sequence>();
  Directions = new Map<Node | null, Orientation>();
  CommonUncleSiblings = new Map<Node, Node[]>();
  Direction(container: Node | null): Orientation {
    return this.Directions.get(container) ?? Orientation.NONE;
  }
  AddNodeUnchecked(node: Node): void {
    this.Nodes.push(node);
    node.Graph = this;
  }
  AddNode(node: Node): Node {
    for (const n of this.Nodes)
      if (
        n.TopLeft !== null &&
        node.TopLeft !== null &&
        n.TopLeft.Equals(node.TopLeft)
      )
        return n;
    this.AddNodeUnchecked(node);
    return node;
  }
  AddNodeToContainer(container: Node | null, node: Node): void {
    const children = this.Containers.get(container) ?? [];
    children.push(node);
    this.Containers.set(container, children);
    node.Container = container;
    if (container) container.isContainer = true;
  }
  AddNewNodeToContainer(container: Node | null, node: Node): void {
    this.AddNodeUnchecked(node);
    this.AddNodeToContainer(container, node);
  }
  RemoveNode(node: Node): void {
    this.Nodes = this.Nodes.filter((n) => n !== node);
  }
  AddEdge(edge: Edge): void {
    if (!this.Edges.includes(edge)) this.Edges.push(edge);
  }
  Connect(a: Node, b: Node): Edge {
    const edge = new Edge(a, b);
    this.Edges.push(edge);
    a.AddIncidentEdgeUnchecked(edge);
    if (a !== b) b.AddIncidentEdgeUnchecked(edge);
    return edge;
  }
  Disconnect(edge: Edge): void {
    edge.From.RemoveIncidentEdge(edge);
    edge.To.RemoveIncidentEdge(edge);
    this.Edges = this.Edges.filter((e) => e !== edge);
  }
  TreeOrder(): Node[] {
    return sortNodes([...this.Trees.keys()]);
  }
  ClusterOrder(): Node[] {
    return sortNodes([...this.Clusters.keys()]);
  }
  SequenceOrder(): Node[] {
    return sortNodes([...this.Sequences.keys()]);
  }
  ComputeCellSize(): void {
    let minHeight = Infinity,
      minWidth = Infinity,
      maxHeight = -Infinity,
      maxWidth = -Infinity;
    for (const node of this.Nodes) {
      minWidth = Math.min(minWidth, node.Width);
      minHeight = Math.min(minHeight, node.Height);
      maxWidth = Math.max(maxWidth, node.Width);
      maxHeight = Math.max(maxHeight, node.Height);
    }
    const minLength = Math.min(minWidth, minHeight),
      maxLength = Math.max(maxWidth, maxHeight);
    this.CellSize = Math.max(
      maxLength < 3 * minLength
        ? Math.ceil(maxLength)
        : Math.ceil((3 * minLength) / 2),
      10,
    );
  }
}
function sortNodes(nodes: Node[]): Node[] {
  return nodes.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
}
