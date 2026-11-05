// Translated from internal/labeling/guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { MaxEngineTreeDepth } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { EuclideanDistance } from '../geo/math.js';
import { type Orientation } from '../geo/orientation.js';
import type { Position } from '../label/label.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { NodeBoundingBox } from '../graphbounds/bounds.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import {
  PositionArrowheadLabel,
  type PositionedArrowheadLabel,
} from './arrowhead.js';
import type { Cluster } from '../layoutgraph/records.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Label, Icon } from '../layoutgraph/records.js';
import {
  covers,
  doesOverlapCalc,
  DoesOverlapExact,
  overlapArea,
  overlapsLine,
} from '../layoutgraph/node-spatial.js';
export class LabelPlacementWorkGuard {
  used = 0n;
  constructor(
    public ctx: Context,
    public location: string,
    public limit: bigint,
  ) {
    if (!ctx) throw new Error(`TALA ${location} requires a context`);
    if (limit < 0n)
      throw new Error(`TALA ${location} work limit must not be negative`);
    this.check();
  }
  step(): void {
    this.add(1n);
  }
  add(units: bigint): void {
    if (units < 0n)
      throw new Error(
        `TALA ${this.location} received a negative work estimate`,
      );
    if (
      this.used < 0n ||
      this.used > this.limit ||
      units > this.limit - this.used
    ) {
      this.check();
      throw new Error(`TALA ${this.location} work exceeds limit ${this.limit}`);
    }
    const previous = this.used;
    this.used += units;
    if (units === 0n || previous / 64n !== this.used / 64n) this.check();
  }
  check(): void {
    const error = this.ctx.Err();
    if (error)
      throw new Error(`${this.location}: ${error.message}`, { cause: error });
  }
}
export function captureLabelPlacement(
  g: Graph | null,
  extraEdges: Edge[],
): { restore(): void } {
  const labels = new Map<Label, Label['Position']>(),
    icons = new Map<Icon, Icon['Position']>(),
    edges = new Map<Edge, number>();
  const label = (l: Label | null) => {
    if (l && !labels.has(l)) labels.set(l, l.Position);
  };
  const edge = (e: Edge) => {
    if (!e) return;
    label(e.Label);
    if (!edges.has(e)) edges.set(e, e.LabelPercentage);
  };
  if (g) {
    for (const node of g.Nodes) {
      if (!node) continue;
      label(node.Label);
      if (node.Icon && !icons.has(node.Icon))
        icons.set(node.Icon, node.Icon.Position);
    }
    for (const e of g.Edges) edge(e);
  }
  for (const e of extraEdges) edge(e);
  return {
    restore() {
      for (const [l, p] of labels) l.Position = p;
      for (const [i, p] of icons) i.Position = p;
      for (const [e, p] of edges) e.LabelPercentage = p;
    },
  };
}
export function nodeOverlapCount(
  node: Node,
  nodes: Node[],
  delta: number,
  guard: LabelPlacementWorkGuard,
): number {
  let count = 0;
  for (const other of nodes) {
    guard.step();
    if (doesOverlapCalc(node, other, delta)) count++;
  }
  return count;
}
export function partialNodeOverlapCount(
  node: Node,
  nodes: Node[],
  delta: number,
  guard: LabelPlacementWorkGuard,
): number {
  let count = 0;
  for (const other of nodes) {
    guard.step();
    if (doesOverlapCalc(node, other, delta) && !covers(other.Box, node.Box))
      count++;
  }
  return count;
}
export function nodeOverlapArea(
  node: Node,
  nodes: Node[],
  delta: number,
  partial: boolean,
  guard: LabelPlacementWorkGuard,
): [number, number] {
  let area = 0,
    count = 0;
  for (const other of nodes) {
    guard.step();
    if (
      !doesOverlapCalc(node, other, delta) ||
      (partial && covers(other.Box, node.Box))
    )
      continue;
    if (delta === 0 || DoesOverlapExact(node, other)) {
      area += overlapArea(node, other);
      count++;
    }
    if (!other.isContainer) {
      area += node.Width * node.Height;
      count++;
    }
  }
  return [area, count];
}
export function edgeOverlapCount(
  node: Node,
  edges: Edge[],
  delta: number,
  guard: LabelPlacementWorkGuard,
): number {
  let count = 0;
  for (const edge of edges) {
    guard.step();
    for (let i = 1; i < edge.Points.length; i++) {
      guard.step();
      if (overlapsLine(node, edge.Points[i - 1]!, edge.Points[i]!, delta))
        count++;
    }
  }
  return count;
}
export function collectLabelPlacementAncestors(
  node: Node,
  guard: LabelPlacementWorkGuard,
): Node[] {
  const ancestors: Node[] = [];
  for (let current: Node | null = node, depth = 0; current; depth++) {
    if (depth >= MaxEngineTreeDepth)
      throw new Error(
        `TALA ${guard.location} container depth exceeds limit ${MaxEngineTreeDepth}`,
      );
    guard.step();
    ancestors.push(current);
    current = current.container();
  }
  return ancestors;
}
export function isLabelPlacementDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: LabelPlacementWorkGuard,
): boolean {
  for (let depth = 0; ; depth++) {
    if (descendant === ancestor) return true;
    if (!descendant) return false;
    if (depth >= MaxEngineTreeDepth)
      throw new Error(
        `TALA ${guard.location} ancestry depth exceeds limit ${MaxEngineTreeDepth}`,
      );
    guard.step();
    if (descendant.Container) descendant = descendant.Container;
    else if (descendant.Cluster) descendant = descendant.Cluster.Vessel;
    else if (descendant.Sequence) descendant = descendant.Sequence.Vessel;
    else descendant = null;
  }
}
export function routeLengthPlacement(
  edge: Edge,
  guard: LabelPlacementWorkGuard,
): number {
  let length = 0;
  for (let i = 1; i < edge.Points.length; i++) {
    guard.step();
    const a = edge.Points[i - 1]!,
      b = edge.Points[i]!;
    length += EuclideanDistance(a.X, a.Y, b.X, b.Y);
  }
  return length;
}
export function edgeLabelTopLeft(
  edge: Edge,
  position: Position,
  width: number,
  height: number,
  guard: LabelPlacementWorkGuard,
): Point | null {
  guard.add(BigInt(edge.Points.length));
  guard.add(BigInt(edge.Points.length));
  const point = EdgeLabelTopLeft(edge, position, width, height);
  guard.check();
  return point;
}
export function positionedArrowheadLabel(
  edge: Edge,
  isTarget: boolean,
  guard: LabelPlacementWorkGuard,
): PositionedArrowheadLabel | null {
  for (let i = 0; i < 3; i++) guard.add(BigInt(edge.Points.length));
  const value = PositionArrowheadLabel(edge, isTarget, edge.Points);
  guard.check();
  return value;
}
export function sortLabelPlacementEdges(
  edges: Edge[],
  guard: LabelPlacementWorkGuard,
): Edge[] {
  let items = edges.map((edge) => {
      guard.step();
      return { edge, length: routeLengthPlacement(edge, guard) };
    }),
    buffer = new Array<(typeof items)[number]>(items.length);
  const less = (a: (typeof items)[number], b: (typeof items)[number]) =>
    b.edge.Points.length === 2 && a.edge.Points.length > 2
      ? true
      : a.edge.Points.length === 2 && b.edge.Points.length > 2
        ? false
        : a.length < b.length;
  for (let width = 1; width < items.length;) {
    for (let start = 0; start < items.length; start += 2 * width) {
      const middle = Math.min(start + width, items.length),
        end = Math.min(start + 2 * width, items.length);
      let left = start,
        right = middle,
        output = start;
      while (left < middle && right < end) {
        guard.step();
        buffer[output++] = less(items[right]!, items[left]!)
          ? items[right++]!
          : items[left++]!;
      }
      while (left < middle) {
        guard.step();
        buffer[output++] = items[left++]!;
      }
      while (right < end) {
        guard.step();
        buffer[output++] = items[right++]!;
      }
    }
    [items, buffer] = [buffer, items];
    if (width > Math.floor(items.length / 2)) break;
    width *= 2;
  }
  guard.check();
  return items.map((item) => item.edge);
}
export function clusterNodeBoundingBoxPlacement(
  node: Node,
  nodes: Node[],
  guard: LabelPlacementWorkGuard,
): [Point, Point] {
  if (!node || !node.TopLeft)
    throw new Error(`TALA ${guard.location} cluster contains an unplaced node`);
  return NodeBoundingBox(node, nodes, {
    Step: () => guard.step(),
    Finish() {},
  });
}
export function clusterLabelPlacementOrientation(
  node: Node,
  member: Node,
  cluster: Cluster,
  guard: LabelPlacementWorkGuard,
): [Orientation, number] {
  let tl = new Point(-Infinity, -Infinity),
    br = new Point(Infinity, Infinity);
  if (cluster.Nodes.length) {
    tl = new Point(Infinity, Infinity);
    br = new Point(-Infinity, -Infinity);
    for (const n of cluster.Nodes) {
      const [a, b] = clusterNodeBoundingBoxPlacement(n, cluster.Nodes, guard);
      tl.X = Math.min(tl.X, a.X);
      tl.Y = Math.min(tl.Y, a.Y);
      br.X = Math.max(br.X, b.X);
      br.Y = Math.max(br.Y, b.Y);
    }
  }
  const shell = new Node(0n, br.X - tl.X, br.Y - tl.Y);
  shell.TopLeft = tl;
  const orientation = nodeOrientation(node, shell);
  let index = -1;
  for (let i = 0; i < cluster.Nodes.length; i++) {
    guard.step();
    if (cluster.Nodes[i] === member) {
      index = i;
      break;
    }
  }
  return [orientation, index];
}
