// Translated straight route selection from internal/routing/coordinator.go and
// cluster_route_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import type { Context } from '../limits/context.js';
import { EuclideanDistance, PrecisionCompare } from '../geo/math.js';
import { Orientation as O, GetOpposite } from '../geo/orientation.js';
import { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { centerPorts, portsByOrientation } from '../layoutgraph/ports.js';
import {
  CrossingCostWeight,
  AxisAlignmentTolerance,
} from '../layoutgraph/geometry-policy.js';
import { NonCenterPortCost } from '../layoutgraph/placement-cost.js';
import { ErrInvalidCandidate } from '../layoutgraph/errors.js';
import {
  PositionArrowheadLabel,
  type PositionedArrowheadLabel,
} from '../labeling/arrowhead.js';
import { PointMap } from './point-map.js';
import type { Route } from './route.js';
import { isNonSharedCrossing } from './cost.js';
import { positionedArrowheadLabelCostGuarded } from './search-costs.js';
import {
  sourceAndTargetClusterNodesGuarded,
  filterEdgeAncestorsGuarded,
  routeIntersectsNodeGuarded,
  overlappingEdgesGuarded,
  edgeCanOverlapEdgesGuarded,
  type SharingBudget,
} from './route-sharing.js';
export function estimateRouteCostGuarded(
  edges: Edge[],
  edge: Edge,
  guard: SharingBudget,
): number {
  let length = 0;
  for (let i = 0; i < edge.Points.length - 1; i++) {
    guard.Step();
    const a = edge.Points[i]!,
      b = edge.Points[i + 1]!;
    length += EuclideanDistance(a.X, a.Y, b.X, b.Y);
  }
  let count = 0;
  for (const other of edges) {
    guard.Step();
    if (other === edge) continue;
    for (let i = 0; i < edge.Points.length - 1; i++)
      for (let j = 0; j < other.Points.length - 1; j++) {
        guard.Step();
        if (isNonSharedCrossing(edge, other, i, j)) count++;
      }
  }
  return (
    length * Math.pow(1.4, edge.Points.length - 2) + CrossingCostWeight * count
  );
}
export function maxSideLength(node: Node, o: O): number {
  return o === O.Top || o === O.Bottom
    ? node.Width
    : o === O.Left || o === O.Right
      ? node.Height
      : Math.max(node.Width, node.Height);
}
export function hasSharpAngleToBorder(from: Point, to: Point, o: O): boolean {
  if (o !== O.Top && o !== O.Bottom && o !== O.Left && o !== O.Right)
    return false;
  const dx = to.X - from.X,
    dy = to.Y - from.Y;
  let angle = Math.abs(
    (180 *
      Math.atan2(
        o === O.Top || o === O.Bottom ? dy : dx,
        o === O.Top || o === O.Bottom ? dx : dy,
      )) /
      Math.PI,
  );
  if (angle > 90) angle = 180 - angle;
  return angle < 30;
}
function portEdges(
  edges: Edge[],
  node: Node,
  guard: SharingBudget,
): PointMap<Edge[]> {
  const result = new PointMap<Edge[]>();
  for (const edge of edges) {
    guard.Step();
    const p =
      edge.From === node
        ? edge.SourcePort()
        : edge.To === node
          ? edge.TargetPort()
          : null;
    if (p) {
      const values = result.get(p) ?? [];
      values.push(edge);
      result.set(p, values);
    }
  }
  return result;
}
function duplicate(edge: Edge, edges: Edge[], guard: SharingBudget): boolean {
  for (const e of edges) {
    guard.Step();
    if (
      (e.From === edge.From && e.To === edge.To) ||
      (e.From === edge.To && e.To === edge.From)
    )
      return true;
  }
  return false;
}
export function routeLineGuarded(
  g: Graph,
  edge: Edge,
  allEdges: Edge[],
  routes: Route[] | null,
  guard: SharingBudget,
): [Point, Point, number] {
  return routeLineChecked(g, edge, allEdges, routes, guard, () => guard.Step());
}
export function routeLine(
  ctx: Context,
  g: Graph,
  edge: Edge,
  allEdges: Edge[],
  routes: Route[] | null,
): [Point, Point, number] {
  const budget: SharingBudget = { Step() {}, Add(_units: bigint) {}, Check() {} };
  return routeLineChecked(g, edge, allEdges, routes, budget, () => {
    const error = ctx.Err();
    if (error)
      throw new Error(`EdgeRouting: ${error.message}`, { cause: error });
  });
}
function routeLineChecked(
  g: Graph,
  edge: Edge,
  allEdges: Edge[],
  routes: Route[] | null,
  guard: SharingBudget,
  check: () => void,
): [Point, Point, number] {
  check();
  const fo = nodeOrientation(edge.From, edge.To);
  if (fo === O.NONE) throw ErrInvalidCandidate;
  const fromPorts = portsByOrientation(edge.From, GetOpposite(fo));
  const to = nodeOrientation(edge.To, edge.From);
  if (to === O.NONE) throw ErrInvalidCandidate;
  const toPorts = portsByOrientation(edge.To, GetOpposite(to));
  const fromEdges = portEdges(allEdges, edge.From, guard),
    toEdges = portEdges(allEdges, edge.To, guard);
  const filter = (edges: Edge[]): Edge[] => {
    const out: Edge[] = [];
    for (const e of edges) {
      check();
      if (e !== edge) out.push(e);
    }
    return out;
  };
  for (const [p, edges] of fromEdges.entries()) fromEdges.set(p, filter(edges));
  for (const [p, edges] of toEdges.entries()) toEdges.set(p, filter(edges));
  const fromCenters = new PointMap<boolean>(),
    toCenters = new PointMap<boolean>();
  for (const p of centerPorts(edge.From)) fromCenters.set(p, true);
  for (const p of centerPorts(edge.To)) toCenters.set(p, true);
  const [sourceCluster, targetCluster] = sourceAndTargetClusterNodesGuarded(
      g,
      edge.From,
      edge.To,
      guard,
    ),
    nonAncestors =
      edge.SourceArrowheadLabel || edge.TargetArrowheadLabel
        ? filterEdgeAncestorsGuarded(edge, g.Nodes, guard)
        : [],
    positioned: PositionedArrowheadLabel[] = [];
  for (let i = 0; i < allEdges.length; i++) {
    check();
    const e = allEdges[i]!;
    if (e === edge) continue;
    const route =
      routes !== null ? routes[i]!.createSegmentEndpoints() : e.Points;
    if (!route.length) continue;
    guard.Add(BigInt(route.length));
    const a = PositionArrowheadLabel(e, false, route),
      b = PositionArrowheadLabel(e, true, route);
    if (a) positioned.push(a);
    if (b) positioned.push(b);
  }
  let best = Infinity,
    bestFrom: Point | null = null,
    bestTo: Point | null = null;
  for (const from of fromPorts) {
    check();
    let fromCost = 0;
    const existingFrom = fromEdges.get(from);
    if (existingFrom?.length) {
      if (duplicate(edge, existingFrom, guard)) continue;
      let matches = true;
      for (const e of existingFrom) {
        check();
        if (
          edge.SourceArrowhead !==
          (e.From === edge.From ? e.SourceArrowhead : e.TargetArrowhead)
        ) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      if (edge.HasSourceArrow()) fromCost = maxSideLength(edge.From, fo) / 2;
    }
    for (const target of toPorts) {
      check();
      let toCost = 0;
      const existingTo = toEdges.get(target);
      if (existingTo?.length) {
        if (duplicate(edge, existingTo, guard)) continue;
        let matches = true;
        for (const e of existingTo) {
          check();
          if (
            edge.TargetArrowhead !==
            (e.To === edge.To ? e.TargetArrowhead : e.SourceArrowhead)
          ) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        toCost = maxSideLength(edge.To, to) / 2;
      }
      const option = new Edge(edge.From, edge.To);
      option.Points = [from, target];
      if (routeIntersectsNodeGuarded(g.Nodes, option, guard)) continue;
      const other = filter(allEdges),
        overlapping = overlappingEdgesGuarded(from, target, other, guard);
      if (
        overlapping.length &&
        !edgeCanOverlapEdgesGuarded(
          edge,
          overlapping,
          sourceCluster,
          targetCluster,
          guard,
        )
      )
        continue;
      let cost =
        fromCost + toCost + estimateRouteCostGuarded(other, option, guard);
      if (
        from.X !== target.X &&
        from.Y !== target.Y &&
        PrecisionCompare(from.X, target.X, AxisAlignmentTolerance) !== 0 &&
        PrecisionCompare(from.Y, target.Y, AxisAlignmentTolerance) !== 0
      )
        cost *= 4;
      if (
        hasSharpAngleToBorder(from, target, fo) ||
        hasSharpAngleToBorder(from, target, to)
      )
        continue;
      if (!fromCenters.has(from)) cost += NonCenterPortCost(g);
      if (!toCenters.has(target)) cost += NonCenterPortCost(g);
      if (edge.SourceArrowheadLabel)
        cost += positionedArrowheadLabelCostGuarded(
          PositionArrowheadLabel(edge, false, [from, target])!,
          nonAncestors,
          positioned,
          [],
          other,
          guard,
        );
      if (edge.TargetArrowheadLabel)
        cost += positionedArrowheadLabelCostGuarded(
          PositionArrowheadLabel(edge, true, [from, target])!,
          nonAncestors,
          positioned,
          [],
          other,
          guard,
        );
      if (cost < best) {
        bestFrom = from;
        bestTo = target;
        best = cost;
      }
    }
  }
  if (best === Infinity) throw ErrInvalidCandidate;
  return [bestFrom!, bestTo!, best];
}
