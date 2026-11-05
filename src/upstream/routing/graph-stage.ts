// Translated whole-graph routing from internal/routing/graph_stage.go and the
// route-stage bounding-box helper at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Position } from '../label/label.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { edgeBoundingBoxValues } from '../layoutgraph/graph-bounds.js';
import {
  isWithinBounds,
  doesOverlapCalc,
} from '../layoutgraph/node-spatial.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { SplitSubgraphsTracked } from '../layoutgraph/subgraphs.js';
import { FixedBoundingBox } from '../graphbounds/bounds.js';
import { New as invariant } from '../invariant/errors.js';
import {
  RouteWorkGuard,
  validateRouteStageGeometry,
  captureRouteMutations,
} from './stage-guard.js';
import { OVGBuildGuard, defaultOVGBuildLimits } from './ovg-resource.js';
import { routeEdgesWithResourceGuards } from './coordinator.js';
import type { OVG } from './ovg.js';
import { MaxSearchWorkUnits } from './search-guard.js';
export const MaxEdgeRoutingStageWorkUnits = 660_000_000n;
export interface GraphRouteOptions {
  ForceReroute: boolean;
  RoutesPreviouslyCompleted: boolean;
  Observer?: { SubgraphRouted(ovg: OVG): void } | null;
  CompletionObserver?: { RoutingCompleted(): void } | null;
}
export function routeStageGraphBoundingBox(
  g: Graph,
  guard: RouteWorkGuard,
): [Point, Point] {
  const [tl, br] = FixedBoundingBox(g.Nodes, guard);
  if (!tl || !br)
    throw invariant('EdgeRouting bounding box contains an unplaced node');
  let minX = tl.X,
    minY = tl.Y,
    maxX = br.X,
    maxY = br.Y;
  for (const edge of g.Edges) {
    guard.Step();
    guard.Add(BigInt(edge.Points.length));
    if (
      edge.Points.length &&
      edge.Label &&
      edge.Label.Position !== Position.Unset
    ) {
      guard.Add(BigInt(edge.Points.length));
      guard.Add(BigInt(edge.Points.length));
    }
    if (edge.Points.length && edge.SourceArrowheadLabel)
      for (let i = 0; i < 3; i++) guard.Add(BigInt(edge.Points.length));
    if (edge.Points.length && edge.TargetArrowheadLabel)
      for (let i = 0; i < 3; i++) guard.Add(BigInt(edge.Points.length));
    const [a, b] = edgeBoundingBoxValues(edge);
    if (Number.isFinite(a.X)) {
      minX = Math.min(minX, a.X);
      minY = Math.min(minY, a.Y);
      maxX = Math.max(maxX, b.X);
      maxY = Math.max(maxY, b.Y);
    }
  }
  guard.Finish();
  return [
    new Point(Round(minX), Round(minY)),
    new Point(Round(maxX), Round(maxY)),
  ];
}
export function RouteGraph(
  ctx: Context,
  graph: Graph | null,
  options: GraphRouteOptions,
  workLimit = MaxEdgeRoutingStageWorkUnits,
): boolean {
  let complete = options.RoutesPreviouslyCompleted;
  if (!graph) throw new Error('TALA EdgeRouting requires a graph');
  const guard = new RouteWorkGuard(ctx, 'EdgeRouting', workLimit);
  validateEngineGraph(ctx, 'EdgeRouting', graph);
  validateRouteStageGeometry(graph, [], guard);
  if (!graph.Edges.length) {
    guard.Finish();
    return complete;
  }
  if (!options.ForceReroute && options.RoutesPreviouslyCompleted) {
    let routed = 0;
    for (const edge of graph.Edges) {
      guard.Step();
      if (!edge.Points.length) continue;
      if (edge.Points.length < 2 || edge.Points.some((p) => !p))
        throw invariant(
          `edge ${edge.ID} has an incomplete route: expected at least two non-nil points, got ${edge.Points.length}`,
        );
      routed++;
    }
    if (routed === graph.Edges.length) {
      complete = true;
      options.CompletionObserver?.RoutingCompleted();
      guard.Finish();
      return complete;
    }
    if (routed !== 0)
      throw invariant(
        `graph is partially routed: ${routed} of ${graph.Edges.length} edges have routes`,
      );
  }
  const snapshot = captureRouteMutations(graph, [], guard);
  try {
    const buildGuard = new OVGBuildGuard(ctx, defaultOVGBuildLimits(), guard),
      [subgraphs, ownership] = SplitSubgraphsTracked(
        ctx,
        graph,
        { IncludeContainers: true, IncludeNears: true, TraverseTrees: false },
        guard,
      );
    try {
      guard.Add(BigInt(subgraphs.length));
      for (const subgraph of subgraphs) {
        guard.Step();
        if (!subgraph.Edges.length) continue;
        guard.Add(BigInt(subgraph.Nodes.length));
        const [tl, br] = routeStageGraphBoundingBox(subgraph, guard);
        tl.X -= 100;
        tl.Y -= 100;
        br.X += 100;
        br.Y += 100;
        const nearby: Node[] = [];
        for (const other of subgraphs) {
          guard.Step();
          if (other === subgraph) continue;
          for (const node of other.Nodes) {
            guard.Step();
            if (isWithinBounds(node, tl, br)) {
              let overlaps = false;
              for (const member of subgraph.Nodes) {
                guard.Step();
                if (doesOverlapCalc(node, member, 0)) {
                  overlaps = true;
                  break;
                }
              }
              if (!overlaps) nearby.push(node);
            }
          }
        }
        guard.Add(
          BigInt(subgraph.Nodes.length) + BigInt(subgraph.Edges.length),
        );
        subgraph.ComputeCellSize();
        const ovg = routeEdgesWithResourceGuards(
          ctx,
          subgraph,
          nearby,
          buildGuard,
          MaxSearchWorkUnits,
          guard,
        );
        guard.Step();
        options.Observer?.SubgraphRouted(ovg);
      }
      const seen = new Set<Node>(),
        queue: Node[] = [];
      const enqueue = (node: Node | null): void => {
        guard.Step();
        if (!node || seen.has(node)) return;
        seen.add(node);
        queue.push(node);
      };
      for (const subgraph of subgraphs)
        for (const node of subgraph.Nodes) enqueue(node);
      for (let i = 0; i < queue.length; i++) {
        const node = queue[i]!,
          [original, captured] = ownership.OriginalGraph(node);
        node.Graph = captured ? original : graph;
        if (node.IsContainer())
          for (const child of graph.Containers.get(node) ?? []) enqueue(child);
        if (node.IsClusterVessel())
          for (const child of graph.Clusters.get(node)?.Nodes ?? [])
            enqueue(child);
        for (const child of graph.Sequences.get(node)?.Nodes ?? [])
          enqueue(child);
      }
      complete = true;
      options.CompletionObserver?.RoutingCompleted();
      guard.Finish();
      return complete;
    } finally {
      ownership.Restore();
    }
  } catch (error) {
    snapshot.restore();
    throw error;
  }
}
