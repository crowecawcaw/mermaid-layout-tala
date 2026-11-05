// Translated from internal/routing/postprocess.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Cluster } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  runAtomicRouteStage,
} from './stage-guard.js';
import { estimateRouteCostGuarded } from './route-line.js';
import { routeIntersectsNodeGuarded } from './route-sharing.js';
export function fixClusterEdgeBranchingGuarded(
  g: Graph,
  guard: RouteWorkGuard,
): void {
  for (const node of g.Nodes) {
    guard.Step();
    if (node.Edges.length <= 1 || node.Cluster) continue;
    const from = new Map<Cluster, boolean>(),
      groups = new Map<Cluster, Edge[]>();
    for (const edge of node.Edges) {
      guard.Step();
      if (edge.Points.length !== 4) continue;
      const adj = node.Adjacent(edge),
        cluster = adj.Cluster;
      if (!cluster || cluster.DesiredArrangement !== cluster.Arrangement)
        continue;
      from.set(cluster, edge.From === node);
      const list = groups.get(cluster) ?? [];
      list.push(edge);
      groups.set(cluster, list);
    }
    for (const [cluster, edges] of groups) {
      guard.Step();
      let back = false,
        front = false;
      for (const edge of edges) {
        guard.Step();
        const a = edge.Points[0]!,
          b = edge.Points[3]!,
          first = cluster.Arrangement === 'Row' ? a.X : a.Y,
          last = cluster.Arrangement === 'Row' ? b.X : b.Y,
          value = from.get(cluster) ? last - first : first - last;
        if (value < 0) back = true;
        if (value > 0) front = true;
      }
      if (!back || !front) continue;
      const p1 = new Map<Edge, Point>(),
        p2 = new Map<Edge, Point>(),
        candidates: Point[] = [];
      for (const edge of edges) {
        guard.Step();
        candidates.push(edge.Points[from.get(cluster) ? 1 : 2]!);
        p1.set(edge, edge.Points[1]!.Copy());
        p2.set(edge, edge.Points[2]!.Copy());
      }
      let best: Point | null = null,
        bestCost = 0;
      for (const point of candidates) {
        guard.Step();
        for (const edge of edges) {
          guard.Step();
          edge.Points[1] = p1.get(edge)!.Copy();
          edge.Points[2] = p2.get(edge)!.Copy();
        }
        let cost = 0,
          reject = false;
        for (const edge of edges) {
          guard.Step();
          const original = estimateRouteCostGuarded(g.Edges, edge, guard);
          if (edge.Points[from.get(cluster) ? 1 : 2] === point) {
            cost += original;
            continue;
          }
          if (from.get(cluster)) {
            edge.Points[1] = point.Copy();
            if (cluster.Arrangement === 'Row') edge.Points[2]!.Y = point.Y;
            else edge.Points[2]!.X = point.X;
          } else {
            edge.Points[2] = point.Copy();
            if (cluster.Arrangement === 'Row') edge.Points[1]!.Y = point.Y;
            else edge.Points[1]!.X = point.X;
          }
          if (routeIntersectsNodeGuarded(g.Nodes, edge, guard)) {
            reject = true;
            break;
          }
          const next = estimateRouteCostGuarded(g.Edges, edge, guard);
          cost += next;
          if (next > original) {
            reject = true;
            break;
          }
        }
        if (!reject && (!best || cost < bestCost)) {
          best = point;
          bestCost = cost;
        }
      }
      for (const edge of edges) {
        guard.Step();
        edge.Points[1] = p1.get(edge)!.Copy();
        edge.Points[2] = p2.get(edge)!.Copy();
      }
      if (best)
        for (const edge of edges) {
          guard.Step();
          if (from.get(cluster)) {
            edge.Points[1] = best.Copy();
            if (cluster.Arrangement === 'Row') edge.Points[2]!.Y = best.Y;
            else edge.Points[2]!.X = best.X;
          } else {
            edge.Points[2] = best.Copy();
            if (cluster.Arrangement === 'Row') edge.Points[1]!.Y = best.Y;
            else edge.Points[1]!.X = best.X;
          }
        }
    }
  }
  guard.Finish();
}
export function fixClusterEdgeBranchingWithLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  runAtomicRouteStage(ctx, 'FixClusterEdgeBranching', g, [], limit, (guard) =>
    fixClusterEdgeBranchingGuarded(g, guard),
  );
}
export function FixClusterEdgeBranching(ctx: Context, g: Graph): void {
  fixClusterEdgeBranchingWithLimit(ctx, g, MaxRouteStageWorkUnits);
}
