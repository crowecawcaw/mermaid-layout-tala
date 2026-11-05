// Translated from internal/routing/coordinator.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Cluster } from '../layoutgraph/records.js';
import { Point } from '../geo/point.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import { New as invariant } from '../invariant/errors.js';
import { PointMap } from './point-map.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  runAtomicRouteStage,
} from './stage-guard.js';
export function findLineBorderIntersection(
  center: Point,
  target: Point,
  node: Node,
): Point {
  const dx = target.X - center.X,
    dy = target.Y - center.Y;
  if (dx === 0 && dy === 0) return center;
  const left = node.TopLeft!.X,
    right = left + node.Width,
    top = node.TopLeft!.Y,
    bottom = top + node.Height;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (right - center.X) / dx);
  else if (dx < 0) t = Math.min(t, (left - center.X) / dx);
  if (dy > 0) t = Math.min(t, (bottom - center.Y) / dy);
  else if (dy < 0) t = Math.min(t, (top - center.Y) / dy);
  if (t === Infinity || t <= 0) return center;
  return new Point(center.X + t * dx, center.Y + t * dy);
}
function descendant(
  descendant: Node | null,
  ancestor: Node | null,
  guard: RouteWorkGuard,
): boolean {
  for (let current = descendant; ;) {
    guard.Step();
    if (ancestor === current) return true;
    if (!current) return false;
    if (current.Container) current = current.Container;
    else if (current.Cluster) current = current.Cluster.Vessel;
    else if (current.Sequence) current = current.Sequence.Vessel;
    else return ancestor === null;
  }
}
export function straightLineIntersectsNonAncestorNodesGuarded(
  g: Graph,
  edge: Edge,
  p1: Point,
  p2: Point,
  guard: RouteWorkGuard,
): boolean {
  for (const node of g.Nodes) {
    guard.Step();
    const from = descendant(edge.From, node, guard),
      to = descendant(edge.To, node, guard);
    if (from || to || node === edge.From || node === edge.To) continue;
    if (passesThrough(node, p1, p2)) return true;
  }
  return false;
}
export function convertToStraightLineGuarded(
  g: Graph,
  edge: Edge,
  guard: RouteWorkGuard,
): void {
  guard.Step();
  if (!edge || !edge.From || !edge.To || !edge.From.TopLeft || !edge.To.TopLeft)
    throw invariant('invalid edge while crosshatching routes');
  const from = edge.From.Center(),
    to = edge.To.Center(),
    fromBorder = findLineBorderIntersection(from, to, edge.From),
    toBorder = findLineBorderIntersection(to, from, edge.To);
  if (
    straightLineIntersectsNonAncestorNodesGuarded(
      g,
      edge,
      fromBorder,
      toBorder,
      guard,
    )
  )
    return;
  guard.Finish();
  edge.Points = [fromBorder, toBorder];
  guard.Finish();
}
export function externalEdgesForClusterGuarded(
  cluster: Cluster,
  guard: RouteWorkGuard,
): Edge[] {
  const edges: Edge[] = [];
  for (const abduction of cluster.EdgeAbductions) {
    guard.Step();
    if (!abduction || !abduction.Edge)
      throw invariant('nil cluster edge abduction while crosshatching routes');
    edges.push(abduction.Edge);
  }
  return edges;
}
export function groupEdgesByClusterPortGuarded(
  cluster: Cluster,
  edges: Edge[],
  guard: RouteWorkGuard,
): PointMap<Edge[]> {
  const result = new PointMap<Edge[]>();
  for (const edge of edges) {
    guard.Step();
    if (!edge) throw invariant('nil edge while grouping cluster ports');
    let port: Point | null = null;
    for (const node of cluster.Nodes) {
      guard.Step();
      if (edge.From === node) {
        port = edge.SourcePort();
        break;
      } else if (edge.To === node) {
        port = edge.TargetPort();
        break;
      }
    }
    if (port) {
      const list = result.get(port) ?? [];
      list.push(edge);
      result.set(port, list);
    }
  }
  return result;
}
export function crosshatchWithWorkLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  runAtomicRouteStage(ctx, 'Crosshatch', g, [], limit, (guard) => {
    const vessels: Node[] = [];
    for (const vessel of g.Clusters.keys()) {
      guard.Step();
      vessels.push(vessel);
    }
    vessels.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
    for (const vessel of vessels) {
      guard.Step();
      const cluster = g.Clusters.get(vessel);
      if (!cluster) throw invariant('nil cluster while crosshatching routes');
      const edges = externalEdgesForClusterGuarded(cluster, guard);
      if (edges.length < 2) continue;
      const groups = groupEdgesByClusterPortGuarded(cluster, edges, guard),
        ports: Point[] = [];
      for (const [port] of groups.entries()) {
        guard.Step();
        ports.push(port);
      }
      ports.sort((a, b) => a.X - b.X || a.Y - b.Y);
      for (const port of ports) {
        const grouped = groups.get(port)!;
        if (grouped.length < 2) continue;
        for (const edge of grouped)
          convertToStraightLineGuarded(g, edge, guard);
      }
    }
  });
}
export function Crosshatch(ctx: Context, g: Graph): void {
  crosshatchWithWorkLimit(ctx, g, MaxRouteStageWorkUnits);
}
