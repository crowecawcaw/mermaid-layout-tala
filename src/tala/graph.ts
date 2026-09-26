import type { LayoutDirection, LayoutEdge, LayoutNode, LayoutResult, Point } from '../layout.js';

/** Mutable TALA graph records. References are private to one layout attempt. */
export class TalaNode {
  readonly id: string;
  width: number;
  height: number;
  readonly labelBBox: { width: number; height: number } | undefined;
  readonly isGroup: boolean;
  readonly direction: LayoutDirection | undefined;
  parent: TalaNode | null = null;
  readonly children: TalaNode[] = [];
  readonly edges: TalaEdge[] = [];
  x: number | undefined;
  y: number | undefined;
  topLeft: Point | undefined;

  constructor(input: LayoutNode) {
    this.id = input.id;
    this.width = input.width;
    this.height = input.height;
    this.labelBBox = input.labelBBox ? { ...input.labelBBox } : undefined;
    this.isGroup = input.isGroup ?? false;
    this.direction = input.dir;
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
  readonly from: TalaNode;
  readonly to: TalaNode;
  readonly labelBBox: { width: number; height: number } | undefined;
  points: Point[] = [];
  labelX: number | undefined;
  labelY: number | undefined;

  constructor(input: LayoutEdge, from: TalaNode, to: TalaNode) {
    this.id = input.id;
    this.from = from;
    this.to = to;
    this.labelBBox = input.labelBBox ? { ...input.labelBBox } : undefined;
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

  static fromFlowchart(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], direction: LayoutDirection): TalaGraph {
    const graph = new TalaGraph();
    const byId = new Map<string, TalaNode>();
    for (const input of [...nodes].sort((a, b) => compareText(a.id, b.id))) {
      if (byId.has(input.id)) throw new Error('duplicate node ID');
      if (!Number.isFinite(input.width) || input.width <= 0 || !Number.isFinite(input.height) || input.height <= 0) {
        throw new Error(`node ${input.id} must have finite positive dimensions`);
      }
      const node = new TalaNode(input);
      graph.nodes.push(node);
      byId.set(node.id, node);
    }
    graph.directions.set(null, direction);
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
    for (const input of [...edges].sort((a, b) => compareText(a.id, b.id))) {
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
    const copy = TalaGraph.fromFlowchart(this.toLayoutNodes(), this.toLayoutEdges(), this.directions.get(null) ?? 'TB');
    copy.cellSize = this.cellSize;
    const oldById = new Map(this.nodes.map((node) => [node.id, node]));
    for (const node of copy.nodes) {
      const previous = oldById.get(node.id)!;
      node.x = previous.x;
      node.y = previous.y;
      node.topLeft = previous.topLeft ? { ...previous.topLeft } : undefined;
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
      ...(node.direction ? { dir: node.direction } : {}),
    }));
  }

  toLayoutEdges(): LayoutEdge[] {
    return this.edges.map((edge) => ({
      id: edge.id, from: edge.from.id, to: edge.to.id,
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

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
