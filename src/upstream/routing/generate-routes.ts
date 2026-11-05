// Translated route generation from internal/routing/ovg_edge_router.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { EuclideanDistance } from '../geo/math.js';
import { Segment } from '../geo/segment.js';
import { ErrInvalidCandidate } from '../layoutgraph/errors.js';
import type { Edge } from '../layoutgraph/edge.js';
import { New as invariant } from '../invariant/errors.js';
import { OVGNode } from './ovg-node.js';
import { Route } from './route.js';
import type { OVGEdgeRouter } from './edge-router.js';
import { edgeDebug } from './route-inventory.js';
import { routeLineGuarded } from './route-line.js';
import { slingshot } from './slingshot.js';
import type { RouteGenerationFlavor } from './sort-edges.js';
export interface GenerateRouteResponse {
  Routes: Route[] | null;
  Distance: number;
  Err: Error | null;
  Flavor: RouteGenerationFlavor;
}
export function routeLine(
  ctx: Context,
  router: OVGEdgeRouter,
  edge: Edge,
): [OVGNode[], number] {
  router.work.Bind(ctx);
  const source = router.ovg.Centers.get(edge.From)!,
    target = router.ovg.Centers.get(edge.To)!;
  try {
    const [from, to, cost] = routeLineGuarded(
      router.graph,
      edge,
      router.inventory.routedEdges,
      router.inventory.routes,
      router.work,
    );
    return [
      [source, router.ovg.occupant(from)!, router.ovg.occupant(to)!, target],
      cost,
    ];
  } catch (error) {
    if (error !== ErrInvalidCandidate) throw error;
    const segment = new Segment(source.Point, target.Point),
      fromIntersections = edge.From.Box.Intersections(segment);
    let from = fromIntersections[0] ?? null;
    if (from) segment.Start = from;
    const to = edge.To.Box.Intersections(segment)[0] ?? null;
    from ??= source.Point;
    return [
      [source, new OVGNode(from), new OVGNode(to ?? target.Point), target],
      EuclideanDistance(source.X, source.Y, target.X, target.Y),
    ];
  }
}
export function generateRoutes(
  ctx: Context,
  router: OVGEdgeRouter,
  straightLineFallback: boolean,
): GenerateRouteResponse {
  const response: GenerateRouteResponse = {
    Routes: null,
    Distance: 0,
    Err: null,
    Flavor: router.flavor,
  };
  try {
    router.work.Bind(ctx);
    let total = 0;
    for (const edge of router.edges) {
      router.work.Step();
      let path: OVGNode[] | null = null,
        distance = 0;
      try {
        [path, distance] = slingshot(ctx, router, edge);
      } catch (error) {
        if (straightLineFallback)
          [path, distance] = routeLine(ctx, router, edge);
        else throw error;
      }
      if (!path || path.length <= 1) {
        try {
          [path, distance] = router.search(ctx, edge);
        } catch (error) {
          if (ctx.Err()) throw error;
          if (straightLineFallback)
            [path, distance] = routeLine(ctx, router, edge);
          else throw error;
        }
        if (!path || path.length <= 1)
          throw invariant(
            `Route '${edgeDebug(edge)}' has size ${path?.length ?? 0}`,
          );
      }
      total += distance;
      const route = new Route(edge, path);
      route.FromPort = path[1]!.Point.Copy();
      route.ToPort = path[path.length - 2]!.Point.Copy();
      router.inventory.addRoute(route);
    }
    response.Routes = router.inventory.routes;
    response.Distance = total;
  } catch (error) {
    response.Err = error as Error;
  }
  try {
    router.work.Finish();
  } catch (error) {
    if (!response.Err) {
      response.Err = error as Error;
      response.Routes = null;
    }
  }
  return response;
}
