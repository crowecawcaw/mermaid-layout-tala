// Translated route-sharing helpers from internal/routing/coordinator.go,
// cluster_route_guard.go and standalone_route_guard.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Graph } from '../layoutgraph/graph.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import { intersects } from './geometry.js';
import { RouteSearchWorkGuard } from './search-guard.js';
export interface SharingBudget {
  Step(): void;
  Add(n: bigint): void;
  Check(): void;
}
export function filterEdgeAncestorsGuarded(
  edge: Edge,
  nodes: Node[],
  guard: SharingBudget,
): Node[] {
  const result: Node[] = [];
  for (const node of nodes) {
    guard.Step();
    if (
      node !== edge.From &&
      node !== edge.To &&
      (isDescendantOf(edge.From, node) || isDescendantOf(edge.To, node))
    )
      continue;
    result.push(node);
  }
  return result;
}
export function sourceAndTargetClusterNodesGuarded(
  g: Graph,
  source: Node,
  target: Node,
  guard: SharingBudget,
): [Set<Node>, Set<Node>] {
  const sources = new Set<Node>(),
    targets = new Set<Node>();
  for (const cluster of g.Clusters.values()) {
    guard.Step();
    let a = false,
      b = false;
    for (const node of cluster.Nodes) {
      guard.Step();
      if (node === source) a = true;
      if (node === target) b = true;
    }
    if (a)
      for (const node of cluster.Nodes) {
        guard.Step();
        if (node !== source) sources.add(node);
      }
    if (b)
      for (const node of cluster.Nodes) {
        guard.Step();
        if (node !== target) targets.add(node);
      }
  }
  return [sources, targets];
}
export function routeIntersectsNodeGuarded(
  nodes: Node[],
  edge: Edge,
  guard: SharingBudget,
): boolean {
  for (const node of nodes) {
    guard.Step();
    if (isDescendantOf(edge.From, node) || isDescendantOf(edge.To, node))
      continue;
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      if (passesThrough(node, edge.Points[i]!, edge.Points[i + 1]!))
        return true;
    }
  }
  return false;
}
export function isVerticalOrHorizontalOverlap(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  return (
    ((a.X === b.X && c.X === d.X) || (a.Y === b.Y && c.Y === d.Y)) &&
    intersects(c, d, a, b)
  );
}
export function overlappingEdgesGuarded(
  a: Point,
  b: Point,
  edges: Edge[],
  guard: SharingBudget,
): Edge[] {
  const result: Edge[] = [];
  for (const edge of edges) {
    guard.Step();
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      if (
        isVerticalOrHorizontalOverlap(
          a,
          b,
          edge.Points[i]!,
          edge.Points[i + 1]!,
        )
      ) {
        result.push(edge);
        break;
      }
    }
  }
  return result;
}
export function edgeCanOverlapEdges(
  edge: Edge,
  others: Edge[],
  source: Set<Node>,
  target: Set<Node>,
): boolean {
  if (others.length === 0) return true;
  if (edge.TargetArrowheadLabel || edge.SourceArrowheadLabel) return false;
  for (const e of others)
    if (
      e.TargetArrowheadLabel ||
      e.SourceArrowheadLabel ||
      !edge.EquivalentStyles(e)
    )
      return false;
  let cluster = false;
  if (
    source.size > 0 &&
    !others.some((e) => !source.has(e.From) && !source.has(e.To))
  )
    cluster = true;
  if (
    !cluster &&
    target.size > 0 &&
    !others.some((e) => !target.has(e.From) && !target.has(e.To))
  )
    cluster = true;
  let directed = edge.IsDirected();
  if (directed)
    for (const e of others)
      if (
        !e.IsDirected() ||
        !(edge.To === e.To || edge.From === e.From) ||
        edge.TargetArrowhead !== e.TargetArrowhead ||
        edge.SourceArrowhead !== e.SourceArrowhead
      ) {
        directed = false;
        break;
      }
  if (directed) return true;
  const bidirectional =
    edge.IsBidirectional() && edge.SourceArrowhead === edge.TargetArrowhead;
  let undirected = false;
  if (bidirectional) {
    for (const e of others) {
      const matching =
        (edge.SourceArrowhead === e.SourceArrowhead &&
          edge.TargetArrowhead === e.TargetArrowhead) ||
        (edge.SourceArrowhead === e.TargetArrowhead &&
          edge.TargetArrowhead === e.SourceArrowhead);
      if (!e.IsBidirectional() || !matching) return false;
    }
  } else {
    undirected = edge.IsUndirected();
    if (undirected) for (const e of others) if (!e.IsUndirected()) return false;
  }
  if (!bidirectional && !undirected) return false;
  if (cluster) return true;
  const counts = new Map<Node, number>();
  for (const e of [edge, ...others])
    for (const node of [e.From, e.To])
      counts.set(node, (counts.get(node) ?? 0) + 1);
  return [...counts.values()].some((n) => n === others.length + 1);
}
export function edgeCanOverlapEdgesGuarded(
  edge: Edge,
  others: Edge[],
  source: Set<Node>,
  target: Set<Node>,
  guard: SharingBudget,
): boolean {
  if (
    others.length === 0 &&
    guard instanceof RouteSearchWorkGuard &&
    guard.HasDone()
  ) {
    guard.Check();
    return true;
  }
  for (let i = 0; i < 10; i++) guard.Add(BigInt(others.length));
  guard.Check();
  return edgeCanOverlapEdges(edge, others, source, target);
}
