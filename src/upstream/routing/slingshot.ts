// Translated slingshot quick routing from internal/routing/slingshot.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { EuclideanDistance } from '../geo/math.js';
import {
  Orientation as O,
  GetOpposite,
  IsDiagonal,
} from '../geo/orientation.js';
import { Edge } from '../layoutgraph/edge.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import { goStableSort } from '../../stable-sort.js';
import { OVGEdge } from './ovg-edge.js';
import type { OVGNode } from './ovg-node.js';
import type { Route } from './route.js';
import type { OVGEdgeRouter } from './edge-router.js';
import {
  RouteChecker,
  findLaunchings,
  findLandings,
  undershot,
  overshot,
  isOnFlightPlan,
  preferLaunchingVertically,
  fillPathGuarded,
} from './slingshot-geometry.js';
import {
  routeIntersectsNodeGuarded,
  edgeCanOverlapEdgesGuarded,
  filterEdgeAncestorsGuarded,
} from './route-sharing.js';
import { positionedArrowheadLabelCostGuarded } from './search-costs.js';
import { idealTurnAxes } from './turns.js';
import { tablePorts } from './table-ports.js';
function arrowheadLabelPenalty(
  router: OVGEdgeRouter,
  edge: Edge,
  route: OVGNode[],
): number {
  if (!edge.SourceArrowheadLabel && !edge.TargetArrowheadLabel) return 0;
  const points = [];
  for (let i = 1; i < route.length - 1; i++) {
    router.work.Step();
    points.push(route[i]!.Point);
  }
  const nodes = filterEdgeAncestorsGuarded(
    edge,
    router.graph.Nodes,
    router.work,
  );
  let penalty = 0;
  if (edge.SourceArrowheadLabel)
    penalty += positionedArrowheadLabelCostGuarded(
      PositionArrowheadLabel(edge, false, points)!,
      nodes,
      router.inventory.positionedLabels,
      router.inventory.routes,
      [],
      router.work,
    );
  if (edge.TargetArrowheadLabel)
    penalty += positionedArrowheadLabelCostGuarded(
      PositionArrowheadLabel(edge, true, points)!,
      nodes,
      router.inventory.positionedLabels,
      router.inventory.routes,
      [],
      router.work,
    );
  return penalty;
}
function launch(
  router: OVGEdgeRouter,
  source: OVGNode,
  anchor: OVGNode,
  target: OVGNode,
  edge: Edge,
): number {
  const nodes = router.ovg.NodesInsideBoundingBox ?? [];
  edge.Points = [source.Point, anchor.Point];
  if (routeIntersectsNodeGuarded(nodes, edge, router.work)) return 0;
  edge.Points = [target.Point, anchor.Point];
  if (routeIntersectsNodeGuarded(nodes, edge, router.work)) return 0;
  return (
    EuclideanDistance(source.X, source.Y, anchor.X, anchor.Y) +
    EuclideanDistance(target.X, target.Y, anchor.X, anchor.Y)
  );
}
function selectedPorts(
  router: OVGEdgeRouter,
  edge: Edge,
  orientation: O,
  vertical: boolean,
  landingVertical: boolean,
): [OVGNode[], OVGNode[]] {
  let source: OVGNode[] = [],
    target: OVGNode[] = [];
  if (edge.FromTableColumnIndex === null) {
    router.work.Add(BigInt(router.ovg.Ports.get(edge.From)?.length ?? 0));
    source = findLaunchings(router.ovg, vertical, orientation, edge.From) ?? [];
  }
  if (edge.ToTableColumnIndex === null) {
    router.work.Add(BigInt(router.ovg.Ports.get(edge.To)?.length ?? 0));
    target =
      findLandings(router.ovg, landingVertical, orientation, edge.To) ?? [];
  }
  if (edge.FromTableColumnIndex !== null || edge.ToTableColumnIndex !== null) {
    const [a, b] = tablePorts(
      router.ovg,
      edge,
      edge.From,
      edge.To,
      true,
      router.work,
    );
    source.push(...(a ?? []));
    target.push(...(b ?? []));
  }
  return [source, target];
}
function nextOnFlight(
  router: OVGEdgeRouter,
  current: OVGNode,
  orientation: O,
  vertical: boolean,
): OVGNode | null {
  for (const edge of current.Edges) {
    router.work.Step();
    const adjacent = current.Adjacent(edge);
    if (isOnFlightPlan(current, adjacent, orientation, vertical))
      return adjacent;
  }
  return null;
}
export function findLShapedRoute(
  ctx: Context,
  router: OVGEdgeRouter,
  routes: Route[],
  order: boolean[],
  verticalPref: boolean,
  strong: boolean,
  edge: Edge,
  orientation: O,
  occupied: RouteChecker,
  crossed: RouteChecker,
): [OVGNode[] | null, number] {
  router.work.Bind(ctx);
  router.work.Step();
  const source = router.ovg.Centers.get(edge.From)!,
    target = router.ovg.Centers.get(edge.To)!,
    copy = new Edge(edge.From, edge.To);
  let shortest: OVGNode[] | null = null,
    best = Infinity;
  for (const vertical of order) {
    router.work.Step();
    if (vertical && edge.FromTableColumnIndex !== null) continue;
    const [sources, targets] = selectedPorts(
      router,
      edge,
      orientation,
      vertical,
      vertical,
    );
    for (const s of sources) {
      router.work.Step();
      let current = s;
      for (;;) {
        router.work.Step();
        const next = nextOnFlight(router, current, orientation, vertical);
        if (!next || overshot(next, edge.To, orientation, vertical, true))
          break;
        if (occupied.check(current, next)) break;
        current = next;
        if (undershot(next, edge.To, orientation, vertical)) continue;
        for (const t of targets) {
          router.work.Step();
          if ((vertical && next.Y !== t.Y) || (!vertical && next.X !== t.X))
            continue;
          let distance = launch(router, s, next, t, copy);
          if (distance === 0) continue;
          if (crossed.check(s, next)) distance += router.crossingCost;
          if (crossed.check(next, t)) distance += router.crossingCost;
          if (strong && verticalPref !== vertical)
            distance += router.crossingCost / 2;
          if (distance < best) {
            const [one, ok1] = fillPathGuarded(s, next, router.work);
            if (!ok1) continue;
            const [two, ok2] = fillPathGuarded(next, t, router.work);
            if (!ok2) continue;
            const middle = [...two!, t];
            let bad = false;
            for (let i = 0; i < middle.length - 2; i++) {
              router.work.Step();
              if (occupied.check(middle[i]!, middle[i + 1]!)) {
                bad = true;
                break;
              }
            }
            if (bad) continue;
            const path = [source, ...one!, ...middle, target];
            let duplicate = false;
            for (const r of routes) {
              router.work.Step();
              if (
                r.FromPort.Equals(s.Point) &&
                r.ToPort.Equals(t.Point) &&
                r.OVGNodes.length === path.length
              ) {
                let same = true;
                for (let i = 2; i < path.length - 2; i++) {
                  router.work.Step();
                  if (!r.OVGNodes[i]!.Point.Equals(path[i]!.Point)) {
                    same = false;
                    break;
                  }
                }
                if (same) {
                  duplicate = true;
                  break;
                }
              }
            }
            if (duplicate) continue;
            distance += arrowheadLabelPenalty(router, edge, path);
            if (distance < best) {
              best = distance;
              shortest = path;
            }
          }
        }
      }
    }
  }
  return [shortest, best];
}
export function findSShapedRoute(
  ctx: Context,
  router: OVGEdgeRouter,
  order: boolean[],
  verticalPref: boolean,
  strong: boolean,
  edge: Edge,
  orientation: O,
  occupied: RouteChecker,
  crossed: RouteChecker,
): [OVGNode[] | null, number] {
  router.work.Bind(ctx);
  router.work.Step();
  const source = router.ovg.Centers.get(edge.From)!,
    target = router.ovg.Centers.get(edge.To)!,
    copy = new Edge(edge.From, edge.To),
    graphNodes = router.ovg.NodesInsideBoundingBox ?? [];
  let shortest: OVGNode[] | null = null,
    best = Infinity;
  for (const vertical of order) {
    router.work.Step();
    if (vertical && edge.FromTableColumnIndex !== null) continue;
    const [sources, targets] = selectedPorts(
        router,
        edge,
        orientation,
        vertical,
        !vertical,
      ),
      sourceAnchors = new Map<OVGNode, OVGNode>(),
      targetAnchors = new Map<OVGNode, OVGNode>(),
      sourceOrder: OVGNode[] = [],
      targetOrder: OVGNode[] = [];
    for (const port of sources) {
      router.work.Step();
      let current = port;
      for (;;) {
        router.work.Step();
        const next = nextOnFlight(router, current, orientation, vertical);
        if (
          !next ||
          overshot(next, edge.To, orientation, vertical, false) ||
          occupied.check(current, next)
        )
          break;
        sourceAnchors.set(next, port);
        sourceOrder.push(next);
        current = next;
      }
    }
    for (const port of targets) {
      router.work.Step();
      let current = port;
      for (;;) {
        router.work.Step();
        const next = nextOnFlight(
          router,
          current,
          GetOpposite(orientation),
          vertical,
        );
        if (
          !next ||
          overshot(
            next,
            edge.From,
            GetOpposite(orientation),
            vertical,
            false,
          ) ||
          occupied.check(current, next)
        )
          break;
        targetAnchors.set(next, port);
        targetOrder.push(next);
        current = next;
      }
    }
    const axes = idealTurnAxes(edge.From, edge.To);
    router.work.ReserveSort(sourceOrder.length);
    goStableSort(sourceOrder, (a, b) => {
      const value = axes[vertical ? 1 : 0]!.val,
        ad = Math.abs((vertical ? a.Y : a.X) - value),
        bd = Math.abs((vertical ? b.Y : b.X) - value);
      return ad < bd ? -1 : bd < ad ? 1 : 0;
    });
    for (const sAnchor of sourceOrder) {
      router.work.Step();
      const s = sourceAnchors.get(sAnchor)!;
      for (const tAnchor of targetOrder) {
        router.work.Step();
        const t = targetAnchors.get(tAnchor)!;
        if (
          (vertical && sAnchor.Y !== tAnchor.Y) ||
          (!vertical && sAnchor.X !== tAnchor.X)
        )
          continue;
        let distance = 0,
          blocked = false;
        for (const [a, b] of [
          [s, sAnchor],
          [sAnchor, tAnchor],
          [tAnchor, t],
        ] as [OVGNode, OVGNode][]) {
          router.work.Step();
          copy.Points = [a.Point, b.Point];
          if (routeIntersectsNodeGuarded(graphNodes, copy, router.work)) {
            blocked = true;
            break;
          }
          distance += EuclideanDistance(a.X, a.Y, b.X, b.Y);
          if (crossed.check(a, b)) distance += router.crossingCost;
        }
        if (blocked) continue;
        if (strong && verticalPref !== vertical)
          distance += router.crossingCost / 2;
        if (distance < best) {
          const [one, ok1] = fillPathGuarded(s, sAnchor, router.work);
          if (!ok1) continue;
          const [two, ok2] = fillPathGuarded(sAnchor, tAnchor, router.work);
          if (!ok2) continue;
          const middle = [...two!, tAnchor];
          let bad = false;
          for (let i = 0; i < middle.length - 2; i++) {
            router.work.Step();
            if (occupied.check(middle[i]!, middle[i + 1]!)) {
              bad = true;
              break;
            }
          }
          if (bad) continue;
          const [three, ok3] = fillPathGuarded(tAnchor, t, router.work);
          if (!ok3) continue;
          const path = [
            source,
            ...one!,
            ...middle.slice(0, -1),
            ...three!,
            t,
            target,
          ];
          distance += arrowheadLabelPenalty(router, edge, path);
          if (distance < best) {
            best = distance;
            shortest = path;
          }
        }
      }
    }
  }
  if (best !== Infinity) best += router.turnCost * 2;
  return [shortest, best];
}
export function slingshot(
  ctx: Context,
  router: OVGEdgeRouter,
  edge: Edge,
): [OVGNode[] | null, number] {
  router.work.Bind(ctx);
  router.work.Step();
  const source = edge.From,
    target = edge.To;
  if (source.Cluster || target.Cluster) return [null, 0];
  const orientation = nodeOrientation(source, target);
  if (
    orientation === O.NONE ||
    edge.FromTableColumnIndex !== null ||
    edge.ToTableColumnIndex !== null ||
    !IsDiagonal(orientation)
  )
    return [null, 0];
  const occupied = new RouteChecker((from, to) => {
    const overlaps = router.inventory.findOverlappingRoutes(from, to) ?? [],
      edges: Edge[] = [];
    for (const route of overlaps) {
      router.work.ReserveProduct(BigInt(route.OVGNodes.length) + 1n, 2n);
      edges.push(route.GEdge);
      if (edge.IsDirected() && route.isOpposingColinear(from, to)) return true;
    }
    const can = edgeCanOverlapEdgesGuarded(
      edge,
      edges,
      new Set(),
      new Set(),
      router.work,
    );
    return edges.length > 0 && !can;
  });
  const crossed = new RouteChecker((from, to) =>
    router.inventory.edgeSet.intersectsWithChecked(
      new OVGEdge(from, to),
      router.work,
    ),
  );
  router.work.ReserveSum(
    BigInt(source.Edges.length),
    BigInt(target.Edges.length),
  );
  const [vertical, strong] = preferLaunchingVertically(
      source,
      target,
      orientation,
    ),
    order = vertical ? [true, false] : [false, true];
  const [path, distance] = findLShapedRoute(
    ctx,
    router,
    router.inventory.routes,
    order,
    vertical,
    strong,
    edge,
    orientation,
    occupied,
    crossed,
  );
  if (distance !== Infinity) return [path, distance + router.turnCost];
  return findSShapedRoute(
    ctx,
    router,
    order,
    vertical,
    strong,
    edge,
    orientation,
    occupied,
    crossed,
  );
}
