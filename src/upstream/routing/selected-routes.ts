// Translated route selection finalization from internal/routing/coordinator.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { IsVertical } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { New as invariant } from '../invariant/errors.js';
import { Slice } from '../gosort/slice.js';
import type { Route } from './route.js';
import type { RouteSearchWorkGuard } from './search-guard.js';
export function reorderSelectedRoutes(
  g: Graph,
  routes: Route[],
  work: RouteSearchWorkGuard,
): void {
  work.Add(BigInt(routes.length));
  const buckets: Route[][] = [],
    grouped = new Set<Route>();
  for (let i = 0; i < routes.length; i++) {
    work.Step();
    const route = routes[i]!;
    if (grouped.has(route)) continue;
    const bucket = [route];
    grouped.add(route);
    for (let j = i + 1; j < routes.length; j++) {
      work.Step();
      const other = routes[j]!;
      if (grouped.has(other)) continue;
      if (route.canSwapEdgesGuarded(other, routes, work)) {
        bucket.push(other);
        grouped.add(other);
      }
    }
    if (bucket.length > 1) buckets.push(bucket);
  }
  work.Add(BigInt(g.Edges.length));
  const indices = new Map<Edge, number>();
  for (let i = 0; i < g.Edges.length; i++) {
    work.Step();
    indices.set(g.Edges[i]!, i);
  }
  for (const bucket of buckets) {
    work.Step();
    work.ReserveSort(bucket.length);
    Slice(bucket, (a, b) => {
      const orientation = nodeOrientation(a.GEdge.From, a.GEdge.To),
        same = a.GEdge.From === b.GEdge.From;
      if (IsVertical(orientation))
        return a.FromPort.X < (same ? b.FromPort.X : b.ToPort.X);
      return a.FromPort.Y < (same ? b.FromPort.Y : b.ToPort.Y);
    });
    work.Add(BigInt(bucket.length));
    const edges: Edge[] = [];
    for (const route of bucket) {
      work.Step();
      edges.push(route.GEdge);
    }
    work.ReserveSort(edges.length);
    Slice(edges, (a, b) => (indices.get(a) ?? -1) < (indices.get(b) ?? -1));
    for (let i = 0; i < bucket.length; i++) {
      work.Step();
      const route = bucket[i]!,
        edge = edges[i]!;
      if (route.GEdge.From !== edge.From) {
        work.Add(BigInt(route.OVGNodes.length));
        [route.FromPort, route.ToPort] = [route.ToPort, route.FromPort];
        route.OVGNodes.reverse();
      }
      route.GEdge = edge;
    }
  }
  work.Check();
}
export function finalizeSelectedRoutes(
  ctx: Context,
  g: Graph,
  routes: Route[],
  selected: Set<Edge> | null,
  work: RouteSearchWorkGuard,
  reorder: boolean,
): void {
  if (!work) throw invariant('selected edge-routing flavor has no work guard');
  if (!g) throw invariant('selected edge-routing flavor has no graph');
  work.Bind(ctx);
  let finished = false;
  try {
    if (selected) {
      const filtered: Route[] = [],
        found = new Set<Edge>();
      for (const route of routes) {
        work.Step();
        if (!route)
          throw invariant('selected edge-routing flavor produced a nil route');
        if (!selected.has(route.GEdge)) continue;
        if (found.has(route.GEdge))
          throw invariant(
            'selected edge-routing flavor produced duplicate routes for an edge',
          );
        found.add(route.GEdge);
        filtered.push(route);
      }
      if (found.size !== selected.size)
        throw invariant(
          'selected edge-routing flavor omitted a requested edge',
        );
      routes = filtered;
    }
    for (const route of routes) {
      work.Step();
      if (
        !route ||
        !route.GEdge ||
        !route.GEdge.From ||
        !route.GEdge.To ||
        route.OVGNodes.length < 2
      )
        throw invariant(
          'selected edge-routing flavor produced an invalid route',
        );
      for (const node of route.OVGNodes) {
        work.Step();
        if (!node || !node.Point)
          throw invariant(
            'selected edge-routing flavor produced an invalid route node',
          );
      }
    }
    if (reorder) reorderSelectedRoutes(g, routes, work);
    work.Add(BigInt(routes.length));
    const updates: {
      edge: Edge;
      points: ReturnType<Route['createSegmentEndpoints']>;
    }[] = [];
    for (const route of routes) {
      work.Step();
      work.Add(BigInt(route.OVGNodes.length));
      updates.push({
        edge: route.GEdge,
        points: route.createSegmentEndpoints(),
      });
    }
    work.Finish();
    for (const update of updates) update.edge.Points = update.points;
    finished = true;
  } finally {
    if (!finished) {
      try {
        work.Finish();
      } catch {}
    }
  }
}
