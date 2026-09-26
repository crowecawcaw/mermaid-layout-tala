import type { LayoutDirection, LayoutEdge, LayoutNode, LayoutResult, Point } from '../layout.js';
import { distanceBetweenBoxes } from './placement-geometry.js';
import { ConnectedNodeGap, CrossingCostWeight } from './geometry-policy.js';

/** Mutable TALA graph records. References are private to one layout attempt. */
export class TalaNode {
  readonly id: string;
  width: number;
  height: number;
  readonly labelBBox: { width: number; height: number } | undefined;
  readonly labelPosition: string | undefined;
  readonly labelPositionFixed: boolean;
  readonly isGroup: boolean;
  readonly direction: LayoutDirection | undefined;
  readonly shape: string | undefined;
  readonly aspectRatio1: boolean;
  readonly fontSize: number | undefined;
  readonly desiredWidth: number | undefined;
  readonly desiredHeight: number | undefined;
  parent: TalaNode | null = null;
  readonly children: TalaNode[] = [];
  readonly edges: TalaEdge[] = [];
  x: number | undefined;
  y: number | undefined;
  topLeft: Point | undefined;
  fixedTopLeft: Point | undefined;

  constructor(input: LayoutNode) {
    this.id = input.id;
    this.width = input.width;
    this.height = input.height;
    this.labelBBox = input.labelBBox ? { ...input.labelBBox } : undefined;
    this.labelPosition = input.labelPosition;
    this.labelPositionFixed = input.labelPositionFixed ?? input.labelPosition !== undefined;
    this.isGroup = input.isGroup ?? false;
    this.direction = input.dir;
    this.shape = input.shape;
    this.aspectRatio1 = input.aspectRatio1 ?? false;
    this.fontSize = input.fontSize;
    this.desiredWidth = input.desiredWidth;
    this.desiredHeight = input.desiredHeight;
    this.fixedTopLeft = input.fixedTopLeft ? { ...input.fixedTopLeft } : undefined;
  }

  adjacent(edge: TalaEdge): TalaNode {
    if (edge.from === this) return edge.to;
    if (edge.to === this) return edge.from;
    throw new Error(`edge ${edge.id} is not incident to node ${this.id}`);
  }

  owningContainer(): TalaNode | null { return this.parent; }

  isDescendantOf(ancestor: TalaNode): boolean {
    let parent = this.parent;
    while (parent) {
      if (parent === ancestor) return true;
      parent = parent.parent;
    }
    return false;
  }
}

export class TalaEdge {
  readonly id: string;
  from: TalaNode;
  to: TalaNode;
  readonly labelBBox: { width: number; height: number } | undefined;
  readonly directed: boolean;
  points: Point[] = [];
  labelX: number | undefined;
  labelY: number | undefined;

  constructor(input: LayoutEdge, from: TalaNode, to: TalaNode) {
    this.id = input.id;
    this.from = from;
    this.to = to;
    this.labelBBox = input.labelBBox ? { ...input.labelBBox } : undefined;
    this.directed = input.directed ?? true;
    from.edges.push(this);
    if (to !== from) to.edges.push(this);
  }
}

export class TalaGraph {
  readonly nodes: TalaNode[] = [];
  readonly edges: TalaEdge[] = [];
  readonly containers = new Map<TalaNode | null, TalaNode[]>();
  readonly directions = new Map<TalaNode | null, LayoutDirection>();
  readonly hubs = new Map<TalaNode, TalaNode[]>();
  cellSize = 10;
  private turnCostCache = 0;
  private crossingCostCache = 0;

  /** Port of layoutgraph.Graph.TurnCost's lazy cost cache. */
  turnCost(): number {
    if (this.turnCostCache !== 0) return this.turnCostCache;
    let longest = 0;
    let hasPositionedEdge = false;
    for (const edge of this.edges) {
      if (!edge.from.topLeft || !edge.to.topLeft) continue;
      hasPositionedEdge = true;
      longest = Math.max(longest, distanceBetweenBoxes(
        { topLeft: edge.from.topLeft, width: edge.from.width, height: edge.from.height },
        { topLeft: edge.to.topLeft, width: edge.to.width, height: edge.to.height },
      ));
    }
    this.turnCostCache = hasPositionedEdge
      ? 0.125 * this.edges.length * Math.max(ConnectedNodeGap, longest) : 0;
    return this.turnCostCache;
  }

  halveTurnCost(): void { this.turnCostCache /= 2; }
  resetTurnCost(): void { this.turnCostCache = 0; }

  /** Port of layoutgraph.Graph.CrossingCost's lazy geometry cache. */
  crossingCost(): number {
    if (this.crossingCostCache !== 0) return this.crossingCostCache;
    let longest = 0;
    let hasPositionedEdge = false;
    for (const edge of this.edges) {
      if (!edge.from.topLeft || !edge.to.topLeft) continue;
      hasPositionedEdge = true;
      longest = Math.max(longest, distanceBetweenBoxes(
        { topLeft: edge.from.topLeft, width: edge.from.width, height: edge.from.height },
        { topLeft: edge.to.topLeft, width: edge.to.width, height: edge.to.height },
      ));
    }
    this.crossingCostCache = hasPositionedEdge
      ? CrossingCostWeight * this.edges.length * Math.max(ConnectedNodeGap, longest) : 0;
    return this.crossingCostCache;
  }

  static fromFlowchart(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], direction?: LayoutDirection): TalaGraph {
    const graph = new TalaGraph();
    const byId = new Map<string, TalaNode>();
    for (const input of nodes) {
      if (byId.has(input.id)) throw new Error('duplicate node ID');
      if (!Number.isFinite(input.width) || input.width <= 0 || !Number.isFinite(input.height) || input.height <= 0) {
        throw new Error(`node ${input.id} must have finite positive dimensions`);
      }
      if (input.fixedTopLeft && (!Number.isFinite(input.fixedTopLeft.x)
        || !Number.isFinite(input.fixedTopLeft.y))) {
        throw new Error(`node ${input.id} must have a finite fixed origin`);
      }
      const node = new TalaNode(input);
      graph.nodes.push(node);
      byId.set(node.id, node);
    }
    if (direction) graph.directions.set(null, direction);
    for (const input of nodes) {
      const node = byId.get(input.id)!;
      if (input.parentId) {
        const parent = byId.get(input.parentId);
        if (!parent?.isGroup) throw new Error(`invalid parent for ${node.id}`);
        node.parent = parent;
        parent.children.push(node);
      }
      if (node.direction) graph.directions.set(node, node.direction);
    }
    for (const node of graph.nodes) {
      const seen = new Set<TalaNode>();
      let parent = node.parent;
      while (parent) {
        if (seen.has(parent) || parent === node) throw new Error('cyclic container hierarchy');
        seen.add(parent);
        parent = parent.parent;
      }
      const children = graph.containers.get(node.parent) ?? [];
      children.push(node);
      graph.containers.set(node.parent, children);
    }
    const edgeIds = new Set<string>();
    for (const input of edges) {
      if (edgeIds.has(input.id)) throw new Error('duplicate edge ID');
      edgeIds.add(input.id);
      const from = byId.get(input.from), to = byId.get(input.to);
      if (!from || !to) throw new Error(`edge ${input.id} references a missing node`);
      graph.edges.push(new TalaEdge(input, from, to));
    }
    graph.computeCellSize();
    return graph;
  }

  /** Port of upstream layoutgraph.Graph.ComputeCellSize. */
  computeCellSize(): void {
    let minHeight = Infinity, minWidth = Infinity;
    let maxHeight = -Infinity, maxWidth = -Infinity;
    for (const node of this.nodes) {
      minWidth = Math.min(minWidth, node.width);
      minHeight = Math.min(minHeight, node.height);
      maxWidth = Math.max(maxWidth, node.width);
      maxHeight = Math.max(maxHeight, node.height);
    }
    const minLength = Math.min(minWidth, minHeight);
    const maxLength = Math.max(maxWidth, maxHeight);
    this.cellSize = maxLength < 3 * minLength
      ? Math.ceil(maxLength)
      : Math.ceil(3 * minLength / 2);
    this.cellSize = Math.max(this.cellSize, 10);
  }

  clone(): TalaGraph {
    const copy = TalaGraph.fromFlowchart(this.toLayoutNodes(), this.toLayoutEdges(), this.directions.get(null));
    copy.cellSize = this.cellSize;
    copy.turnCostCache = this.turnCostCache;
    copy.crossingCostCache = this.crossingCostCache;
    const oldById = new Map(this.nodes.map((node) => [node.id, node]));
    for (const node of copy.nodes) {
      const previous = oldById.get(node.id)!;
      node.x = previous.x;
      node.y = previous.y;
      node.topLeft = previous.topLeft ? { ...previous.topLeft } : undefined;
      node.fixedTopLeft = previous.fixedTopLeft ? { ...previous.fixedTopLeft } : undefined;
    }
    const edgeById = new Map(this.edges.map((edge) => [edge.id, edge]));
    for (const edge of copy.edges) {
      const previous = edgeById.get(edge.id)!;
      edge.points = previous.points.map((point) => ({ ...point }));
      edge.labelX = previous.labelX;
      edge.labelY = previous.labelY;
    }
    for (const [hub, spokes] of this.hubs) {
      const cloneHub = copy.nodes.find((node) => node.id === hub.id)!;
      copy.hubs.set(cloneHub, spokes.map((spoke) => copy.nodes.find((node) => node.id === spoke.id)!));
    }
    return copy;
  }

  toLayoutNodes(): LayoutNode[] {
    return this.nodes.map((node) => ({
      id: node.id, width: node.width, height: node.height,
      ...(node.parent ? { parentId: node.parent.id } : {}),
      ...(node.isGroup ? { isGroup: true } : {}),
      ...(node.labelBBox ? { labelBBox: { ...node.labelBBox } } : {}),
      ...(node.labelPosition ? { labelPosition: node.labelPosition,
        labelPositionFixed: node.labelPositionFixed } : {}),
      ...(node.direction ? { dir: node.direction } : {}),
      ...(node.shape ? { shape: node.shape } : {}),
      ...(node.aspectRatio1 ? { aspectRatio1: true } : {}),
      ...(node.fontSize !== undefined ? { fontSize: node.fontSize } : {}),
      ...(node.fixedTopLeft ? { fixedTopLeft: { ...node.fixedTopLeft } } : {}),
      ...(node.desiredWidth !== undefined ? { desiredWidth: node.desiredWidth } : {}),
      ...(node.desiredHeight !== undefined ? { desiredHeight: node.desiredHeight } : {}),
    }));
  }

  toLayoutEdges(): LayoutEdge[] {
    return this.edges.map((edge) => ({
      id: edge.id, from: edge.from.id, to: edge.to.id,
      ...(edge.directed ? {} : { directed: false }),
      ...(edge.labelBBox ? { labelBBox: { ...edge.labelBBox } } : {}),
    }));
  }

  applyResult(result: LayoutResult): void {
    const placedNodes = new Map(result.nodes.map((node) => [node.id, node]));
    const placedEdges = new Map(result.edges.map((edge) => [edge.id, edge]));
    for (const node of this.nodes) {
      const placed = placedNodes.get(node.id);
      if (!placed) throw new Error(`layout omitted node ${node.id}`);
      node.x = placed.x;
      node.y = placed.y;
      node.topLeft = { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 };
      node.width = placed.width;
      node.height = placed.height;
    }
    for (const edge of this.edges) {
      const placed = placedEdges.get(edge.id);
      if (!placed) throw new Error(`layout omitted edge ${edge.id}`);
      edge.points = placed.points.map((point) => ({ ...point }));
      edge.labelX = placed.x;
      edge.labelY = placed.y;
    }
  }
}
