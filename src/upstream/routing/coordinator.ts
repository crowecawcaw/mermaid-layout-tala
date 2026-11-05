// Translated routeEdgesWithResourceGuards from internal/routing/coordinator.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Tree, Arrowhead } from '../layoutgraph/records.js';
import {
  TurnCost,
  CrossingCost,
  NonCenterPortCost,
} from '../layoutgraph/placement-cost.js';
import { Route as RouteLoops } from '../loops/loops.js';
import { New as invariant } from '../invariant/errors.js';
import { buildOVGFromGraphWithGuard } from './ovg-build.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import type { RouteWorkGuard } from './stage-guard.js';
import { MaxSearchWorkUnits } from './search-guard.js';
import { OVGEdgeRouter } from './edge-router.js';
import type { Route } from './route.js';
import { generateRoutes } from './generate-routes.js';
import type { RouteGenerationFlavor } from './sort-edges.js';
import { finalizeSelectedRoutes } from './selected-routes.js';
import { routeSentinelEdge, makeLoopRoute } from './sentinel-routes.js';
export function treeEdgeMap(g: Graph): Set<Edge> {
  const result = new Set<Edge>();
  const visit = (tree: Tree): void => {
    if (tree.Parent && tree.SentinelEdge) result.add(tree.SentinelEdge);
    for (const child of tree.Children) visit(child);
  };
  const roots = [...g.Trees.keys()].sort((a, b) =>
    a === b
      ? 0
      : a === null
        ? -1
        : b === null
          ? 1
          : a.ID < b.ID
            ? -1
            : a.ID > b.ID
              ? 1
              : 0,
  );
  for (const root of roots)
    for (const tree of g.Trees.get(root) ?? []) visit(tree);
  for (const root of roots) {
    if (!root) continue;
    const trees = g.Trees.get(root) ?? [];
    if (
      !root.IsContainer() &&
      root.Edges.every((edge) => trees.some((t) => t.SentinelEdge === edge))
    )
      for (const tree of trees)
        if (tree.SentinelEdge) result.add(tree.SentinelEdge);
  }
  return result;
}
export function routeEdgesWithResourceGuards(
  ctx: Context,
  g: Graph,
  nearby: Node[],
  ovgGuard: OVGBuildGuard,
  searchLimit: bigint = MaxSearchWorkUnits,
  aggregate: RouteWorkGuard | null = null,
): OVG {
  const ovg = buildOVGFromGraphWithGuard(g, nearby, ovgGuard),
    existing: Route[] = [],
    treeEdges = treeEdgeMap(g),
    arrows = new Map<OVGNode, Set<Arrowhead>>(),
    routed = new Set<Edge>();
  for (const node of g.Nodes) {
    const tree = g.NodeToTree.get(node);
    if (tree) {
      if (!tree.SentinelEdge || !treeEdges.has(tree.SentinelEdge)) continue;
      let route: Route;
      try {
        route = routeSentinelEdge(tree, ovg.Ports, ovg.Centers, arrows);
      } catch {
        continue;
      }
      existing.push(route);
      const from = route.OVGNodes[1]!,
        to = route.OVGNodes.at(-2)!;
      const source = arrows.get(from) ?? new Set(),
        target = arrows.get(to) ?? new Set();
      source.add(tree.SentinelEdge.SourceArrowhead);
      target.add(tree.SentinelEdge.TargetArrowhead);
      arrows.set(from, source);
      arrows.set(to, target);
      routed.add(tree.SentinelEdge);
    } else
      for (const edge of RouteLoops(node)) {
        existing.push(makeLoopRoute(edge, ovg));
        routed.add(edge);
      }
  }
  const remaining = g.Edges.filter((e) => !routed.has(e));
  CrossingCost(g);
  TurnCost(g);
  NonCenterPortCost(g);
  const flavors: RouteGenerationFlavor[] = g.Nodes[0]!.Hierarchy
    ? ['TopDownLeftRight']
    : ['ShortestToLongest', 'LongestToShortest', 'Default'];
  const routers = flavors.map(
    (flavor) =>
      new OVGEdgeRouter(
        ctx,
        flavor,
        ovg,
        g,
        existing,
        remaining,
        searchLimit,
        aggregate,
      ),
  );
  const responses = routers.map((router) => generateRoutes(ctx, router, true));
  let firstError: Error | null = null;
  const successful = new Map<
    RouteGenerationFlavor,
    { router: OVGEdgeRouter; distance: number; routes: Route[] }
  >();
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]!;
    if (response.Err) {
      if (
        response.Err.message.startsWith('TALA route-stage work limit exceeded')
      )
        throw response.Err;
      firstError ??= response.Err;
      continue;
    }
    successful.set(response.Flavor, {
      router: routers[i]!,
      distance: response.Distance,
      routes: response.Routes!,
    });
  }
  if (!successful.size)
    throw firstError ?? invariant('edge routing produced no flavor responses');
  let selected: {
      router: OVGEdgeRouter;
      distance: number;
      routes: Route[];
    } | null = null,
    best = Infinity;
  for (const flavor of flavors) {
    const candidate = successful.get(flavor);
    if (
      candidate &&
      PrecisionCompare(candidate.distance, best, PRECISION) < 0
    ) {
      selected = candidate;
      best = candidate.distance;
    }
  }
  finalizeSelectedRoutes(
    ctx,
    g,
    selected!.routes,
    null,
    selected!.router.work,
    true,
  );
  return ovg;
}
