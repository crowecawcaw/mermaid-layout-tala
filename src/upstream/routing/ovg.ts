// Translated foundational OVG operations from internal/routing/ovg.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { Point } from '../geo/point.js';
import { EuclideanDistance } from '../geo/math.js';
import { OVGNode } from './ovg-node.js';
import { OVGEdge } from './ovg-edge.js';
export class OVG {
  Nodes: OVGNode[] = [];
  private occupied = new Map<number, Map<number, OVGNode>>();
  Edges: OVGEdge[] = [];
  VerticalEdges = new Map<number, OVGEdge[]>();
  HorizontalEdges = new Map<number, OVGEdge[]>();
  Ports = new Map<Node, OVGNode[]>();
  Centers = new Map<Node, OVGNode>();
  constructor(public NodesInsideBoundingBox: Node[] | null) {}
  occupant(point: Point): OVGNode | undefined {
    return Number.isNaN(point.X) || Number.isNaN(point.Y)
      ? undefined
      : this.occupied.get(point.X)?.get(point.Y);
  }
  AddNodeUnchecked(node: OVGNode): void {
    this.Nodes.push(node);
    let ys = this.occupied.get(node.X);
    if (!ys) {
      ys = new Map();
      this.occupied.set(node.X, ys);
    }
    ys.set(node.Y, node);
  }
  AddNode(node: OVGNode): OVGNode {
    const existing = this.occupant(node.Point);
    if (existing) return existing;
    this.AddNodeUnchecked(node);
    return node;
  }
  Connect(a: OVGNode, b: OVGNode): OVGEdge | null {
    if ((a.IsNodeCenter && !b.isPort()) || (b.IsNodeCenter && !a.isPort()))
      return null;
    const edge = new OVGEdge(a, b);
    this.Edges.push(edge);
    a.addEdge(edge);
    b.addEdge(edge);
    const map = edge.isVertical()
        ? this.VerticalEdges
        : edge.isHorizontal()
          ? this.HorizontalEdges
          : null,
      key = edge.isVertical() ? a.X : a.Y;
    if (map) {
      const edges = map.get(key) ?? [];
      edges.push(edge);
      map.set(key, edges);
    }
    edge.Distance = EuclideanDistance(a.X, a.Y, b.X, b.Y);
    return edge;
  }
  removeIsolatedNodes(guard: { Step(): void; Check(): void }): void {
    guard.Check();
    const nodes: OVGNode[] = [];
    for (const node of this.Nodes) {
      guard.Step();
      if (node.Edges.length > 0) nodes.push(node);
    }
    this.Nodes = nodes;
    guard.Check();
  }
  reindexOccupiedPoints(): void {
    this.occupied = new Map();
    for (const node of this.Nodes) {
      let ys = this.occupied.get(node.X);
      if (!ys) {
        ys = new Map();
        this.occupied.set(node.X, ys);
      }
      ys.set(node.Y, node);
    }
  }
}
