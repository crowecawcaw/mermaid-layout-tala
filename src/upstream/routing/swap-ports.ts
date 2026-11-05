// Translated from internal/routing/swap_ports.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point, IntersectionPoint } from '../geo/point.js';
import { Orientation as O, IsVertical } from '../geo/orientation.js';
import { PointMap } from './point-map.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  runAtomicRouteStage,
  stableSortRouteValues,
} from './stage-guard.js';
import { tunnelRangesBetweenChecked } from './tunnel.js';
import {
  pointsAt,
  swapCoordinate,
  doesNotPassThroughNodesGuarded,
  edgesIntersect,
  canSwapPorts,
  isSShaped,
  isLShaped,
  isUShaped,
  sToLShapedBendPoint,
  copyEdgePointsGuarded,
  insertEdgePointGuarded,
  removeEdgePointsGuarded,
  swapPoints,
} from './swap-port-geometry.js';
export function makeStraightLineGuarded(
  g: Graph,
  e: Edge,
  occupied: PointMap<boolean>,
  guard: RouteWorkGuard,
): boolean {
  const fromPort = e.SourcePort()!,
    toPort = e.TargetPort()!,
    [ranges, horizontal] = tunnelRangesBetweenChecked(
      g,
      e.From,
      e.To,
      false,
      guard,
    );
  for (const range of ranges ?? []) {
    guard.Step();
    for (let v = range.start + 5; v <= range.end - 5; v += 5) {
      guard.Step();
      const from = horizontal
          ? new Point(fromPort.X, v)
          : new Point(v, fromPort.Y),
        to = horizontal ? new Point(toPort.X, v) : new Point(v, toPort.Y);
      if (occupied.has(from) || occupied.has(to)) continue;
      e.Points = [from, to];
      return true;
    }
  }
  return false;
}
export function refineEdgeGuarded(
  g: Graph,
  e: Edge,
  guard: RouteWorkGuard,
): boolean {
  guard.Step();
  if (
    e.IsLoop() ||
    e.Points.length <= 2 ||
    (e.FromTableColumnIndex !== null && e.ToTableColumnIndex !== null) ||
    e.From.Graph!.NodeToTree.has(e.From) ||
    e.To.Graph!.NodeToTree.has(e.To)
  )
    return false;
  const occupied = new PointMap<boolean>();
  for (const n of [e.From, e.To]) {
    const local = new PointMap<boolean>();
    for (const edge of n.Edges) {
      guard.Step();
      local.set(
        (edge.From === n ? edge.SourcePort() : edge.TargetPort())!,
        true,
      );
    }
    if (n === e.From) {
      for (const [p] of local.entries()) occupied.set(p, true);
    } else
      for (const [p] of local.entries()) {
        guard.Step();
        occupied.set(p, true);
      }
  }
  if (isSShaped(e.Points) || isLShaped(e.Points))
    return makeStraightLineGuarded(g, e, occupied, guard);
  if (isUShaped(e.Points)) return false;
  if (isSShaped(e.Points.slice(0, 4))) {
    const p = sToLShapedBendPoint(e.Points.slice(0, 4));
    if (
      doesNotPassThroughNodesGuarded(
        g,
        [e.From, e.To],
        e.Points[0]!,
        p,
        p,
        e.Points[3]!,
        guard,
      )
    ) {
      removeEdgePointsGuarded(e, guard, 1, 2, 3);
      insertEdgePointGuarded(e, p, 1, guard);
      return true;
    }
  }
  return false;
}
export function swapEdgesOnSameSide(
  n: Node,
  byOrientation: Map<O, Edge[]>,
  ports: PointMap<Edge[]>,
  guard: RouteWorkGuard,
): boolean {
  let swapped = false;
  for (const [o, edges] of byOrientation) {
    guard.Step();
    stableSortRouteValues(
      edges,
      (a, b) => {
        const [p1, , p3] = pointsAt(a, n),
          [q1, , q3] = pointsAt(b, n);
        return IsVertical(o)
          ? p1.X === q1.X
            ? p3.X < q3.X
            : p1.X < q1.X
          : p1.Y === q1.Y
            ? p3.Y < q3.Y
            : p1.Y < q1.Y;
      },
      guard,
    );
    for (let i = 0; i < edges.length - 1; i++) {
      guard.Step();
      const a = edges[i]!,
        b = edges[i + 1]!;
      if (!edgesIntersect(a, b, n, o) || !canSwapPorts(a, b, n, ports))
        continue;
      const [p1, p2] = pointsAt(a, n),
        [q1, q2] = pointsAt(b, n);
      swapCoordinate(p1, q1, o);
      swapCoordinate(p2, q2, o);
      if (
        doesNotPassThroughNodesGuarded(n.Graph!, [n], p1, p2, q1, q2, guard)
      ) {
        [edges[i], edges[i + 1]] = [b, a];
        swapped = true;
      } else {
        swapCoordinate(p1, q1, o);
        swapCoordinate(p2, q2, o);
      }
    }
  }
  return swapped;
}
export function swapEdgesOnAdjacentSides(
  n: Node,
  byOrientation: Map<O, Edge[]>,
  ports: PointMap<Edge[]>,
  guard: RouteWorkGuard,
): boolean {
  let swapped = false;
  const vertical = [
      ...(byOrientation.get(O.Top) ?? []),
      ...(byOrientation.get(O.Bottom) ?? []),
    ],
    horizontal = [
      ...(byOrientation.get(O.Left) ?? []),
      ...(byOrientation.get(O.Right) ?? []),
    ];
  for (const a of vertical) {
    guard.Step();
    for (const b of horizontal) {
      guard.Step();
      if (a.Points.length <= 2) break;
      if (b.Points.length <= 2 || !canSwapPorts(a, b, n, ports)) continue;
      const [a1, a2, a3] = pointsAt(a, n),
        [b1, b2, b3] = pointsAt(b, n),
        intersection = IntersectionPoint(a2, a3, b2, b3);
      if (!intersection) continue;
      const aPoints = copyEdgePointsGuarded(a, guard),
        bPoints = copyEdgePointsGuarded(b, guard);
      swapPoints(a1, b1);
      swapPoints(a2, b2);
      const ai = intersection.Copy();
      insertEdgePointGuarded(
        a,
        ai,
        a.From === n ? 2 : a.Points.length - 2,
        guard,
      );
      if (ai.X === a2.X) {
        ai.X += 2.5;
        a2.X += 2.5;
      } else {
        ai.Y -= 2.5;
        a2.Y -= 2.5;
      }
      const bi = intersection.Copy();
      insertEdgePointGuarded(
        b,
        bi,
        b.From === n ? 2 : b.Points.length - 2,
        guard,
      );
      if (bi.X === b2.X) {
        bi.X += 2.5;
        b2.X += 2.5;
      } else {
        bi.Y -= 2.5;
        b2.Y -= 2.5;
      }
      const improvedA = refineEdgeGuarded(n.Graph!, a, guard),
        improvedB = refineEdgeGuarded(n.Graph!, b, guard);
      if (!improvedA && !improvedB) {
        a.Points = aPoints;
        b.Points = bPoints;
      } else swapped = true;
    }
  }
  return swapped;
}
export function swapEdgePortsGuarded(n: Node, guard: RouteWorkGuard): boolean {
  const orientations = new Map<O, Edge[]>(),
    ports = new PointMap<Edge[]>(),
    byteLength = (text: string) => new TextEncoder().encode(text).length;
  for (const edge of n.Edges) {
    guard.Step();
    if (
      edge.IsLoop() ||
      edge.Points.length < 3 ||
      edge.FromTableColumnIndex !== null ||
      edge.ToTableColumnIndex !== null
    )
      continue;
    if (
      (edge.SourceArrowheadLabel &&
        byteLength(edge.SourceArrowheadLabel.Text) > 3) ||
      (edge.TargetArrowheadLabel &&
        byteLength(edge.TargetArrowheadLabel.Text) > 3)
    )
      continue;
    const [p1, p2] = pointsAt(edge, n),
      o =
        p1.X < p2.X
          ? O.Right
          : p1.X > p2.X
            ? O.Left
            : p1.Y < p2.Y
              ? O.Bottom
              : O.Top,
      list = orientations.get(o) ?? [];
    list.push(edge);
    orientations.set(o, list);
    const at = ports.get(p1) ?? [];
    at.push(edge);
    ports.set(p1, at);
  }
  const same = swapEdgesOnSameSide(n, orientations, ports, guard),
    adjacent = swapEdgesOnAdjacentSides(n, orientations, ports, guard);
  return adjacent || same;
}
export function swapAllEdgePortsWithWorkLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  runAtomicRouteStage(ctx, 'SwapEdgePorts', g, [], limit, (guard) => {
    for (const node of g.Nodes) {
      guard.Step();
      swapEdgePortsGuarded(node, guard);
    }
  });
}
export function SwapAllEdgePorts(ctx: Context, g: Graph): void {
  swapAllEdgePortsWithWorkLimit(ctx, g, MaxRouteStageWorkUnits);
}
