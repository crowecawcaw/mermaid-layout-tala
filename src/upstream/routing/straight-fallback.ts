// Translated from internal/routing/coordinator.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Point } from '../geo/point.js';
import { EuclideanDistance } from '../geo/math.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { treeEdgeMap } from './coordinator.js';
import { estimateRouteCost } from './cost.js';
import { routeLine } from './route-line.js';
function check(ctx: Context): void {
  const error = ctx.Err();
  if (error) throw new Error(`EdgeRouting: ${error.message}`, { cause: error });
}
export function isStraightEdgeFallbackCandidate(
  edge: Edge,
  clusterNodes: Set<Node>,
  treeEdges: Set<Edge>,
): boolean {
  return (
    !clusterNodes.has(edge.From) &&
    !clusterNodes.has(edge.To) &&
    !treeEdges.has(edge) &&
    !edge.From.Hierarchy &&
    edge.FromTableColumnIndex === null &&
    edge.ToTableColumnIndex === null
  );
}
export function tryStraightEdgeFallback(
  ctx: Context,
  g: Graph,
  edge: Edge,
): boolean {
  check(ctx);
  const originalCost = estimateRouteCost(g.Edges, edge);
  let from: Point, to: Point, lineCost: number;
  try {
    [from, to, lineCost] = routeLine(ctx, g, edge, g.Edges, null);
  } catch (error) {
    if (IsCandidateRejection(error)) return false;
    throw error;
  }
  if (
    edge.Points.length === 4 &&
    EuclideanDistance(
      edge.Points[1]!.X,
      edge.Points[1]!.Y,
      edge.Points[2]!.X,
      edge.Points[2]!.Y,
    ) <= 5
  )
    lineCost /= 4;
  check(ctx);
  if (lineCost < originalCost) {
    edge.Points = [from, to];
    return true;
  }
  return false;
}
export function StraightEdgesFallback(ctx: Context, g: Graph): void {
  check(ctx);
  const clusterNodes = new Set<Node>();
  for (const cluster of g.Clusters.values()) {
    check(ctx);
    for (const node of cluster.Nodes) {
      check(ctx);
      clusterNodes.add(node);
    }
  }
  const trees = treeEdgeMap(g);
  check(ctx);
  for (let i = 0; i < g.Edges.length; i++) {
    check(ctx);
    if (!isStraightEdgeFallbackCandidate(g.Edges[i]!, clusterNodes, trees))
      continue;
    straightEdgesFallbackFrom(ctx, g, clusterNodes, trees, i);
    return;
  }
}
function straightEdgesFallbackFrom(
  ctx: Context,
  g: Graph,
  clusters: Set<Node>,
  trees: Set<Edge>,
  start: number,
): void {
  const costs = {
      crossingCost: g.crossingCost,
      turnCost: g.turnCost,
      nonCenterPortCost: g.nonCenterPortCost,
    },
    changes: { edge: Edge; points: Point[] }[] = [];
  let complete = false;
  try {
    for (let i = start; i < g.Edges.length; i++) {
      const edge = g.Edges[i]!;
      if (i !== start) {
        check(ctx);
        if (!isStraightEdgeFallbackCandidate(edge, clusters, trees)) continue;
      }
      const points = edge.Points;
      if (tryStraightEdgeFallback(ctx, g, edge)) changes.push({ edge, points });
    }
    check(ctx);
    complete = true;
  } finally {
    if (!complete) {
      for (let i = changes.length - 1; i >= 0; i--)
        changes[i]!.edge.Points = changes[i]!.points;
      Object.assign(g, costs);
    }
  }
}
