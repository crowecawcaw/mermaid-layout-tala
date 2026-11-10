// Translated from internal/routing/standalone_router.go at D2 bf337903.
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import { maxEngineTopologyReferences, validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { PlaceNewEdges } from '../labeling/place.js';
import { balanceRegularEdgesGuarded, isSpecialEdgeForBalancing } from './balance-segments.js';
import { routeAdditionalEdgesWithResourceLimits } from './coordinator.js';
import { defaultOVGBuildLimits, type OVGBuildLimits } from './ovg-resource.js';
import { MaxRouteStageWorkUnits, runAtomicRouteStageAfterPreflight } from './stage-guard.js';
import { traceToShapeBorderGuarded } from './trace.js';
import { reorderDuplicatesInEdgesGuarded, tryStraightEdgeFallbackGuarded } from './standalone-route-guard.js';

/** Route only the selected edges, preserving all unselected routes. */
export function RouteEdges(ctx: Context, graph: Graph, edges: Edge[]): void {
  routeEdgesWithBudgets(ctx, graph, edges, defaultOVGBuildLimits(), MaxRouteStageWorkUnits);
}
export function routeEdgesWithBudgets(
  ctx: Context, graph: Graph, edges: Edge[], limits: OVGBuildLimits, workLimit: bigint,
): void {
  if (!graph) throw new Error('cannot route edges on a nil graph');
  if (!ctx) throw new Error('cannot route edges without a context');
  const initial = ctx.Err();
  if (initial) throw initial;
  if (edges.length > maxEngineTopologyReferences)
    throw new Error(`TALA EdgeRouting selected edge references exceed limit ${maxEngineTopologyReferences}`);
  validateEngineGraph(ctx, 'RouteEdges', graph);
  if (!edges.length) return;
  if (!graph.Nodes.length) throw new Error('cannot route edges on an empty graph');
  if (edges.length > graph.Edges.length)
    throw new Error(`selected edge count ${edges.length} exceeds graph edge count ${graph.Edges.length}`);
  const nodes = new Set(graph.Nodes), inventory = new Set<Edge>();
  for (let i = 0; i < graph.Edges.length; i++) {
    const edge = graph.Edges[i];
    if (!edge) throw new Error(`graph edge at index ${i} is nil`);
    if (!edge.From || !edge.To || !edge.From.TopLeft || !edge.To.TopLeft)
      throw new Error(`graph edge ${edge.ID} has unplaced or missing endpoints`);
    if (!nodes.has(edge.From)) throw new Error(`graph edge ${edge.ID} source node does not belong to the graph`);
    if (!nodes.has(edge.To)) throw new Error(`graph edge ${edge.ID} target node does not belong to the graph`);
    inventory.add(edge);
  }
  const selected = new Set<Edge>();
  for (const edge of edges) {
    if (!edge) throw new Error('cannot route a nil edge');
    if (!inventory.has(edge)) throw new Error(`edge ${edge.ID} does not belong to the graph`);
    if (selected.has(edge)) throw new Error(`edge ${edge.ID} was selected more than once`);
    selected.add(edge);
  }
  for (const edge of graph.Edges) {
    if (selected.has(edge)) continue;
    if (edge.Points.length < 2 || edge.Points.some((p) => !p))
      throw new Error(`unselected edge ${edge.ID} has no complete route`);
  }
  runAtomicRouteStageAfterPreflight(ctx, 'EdgeRouting', graph, edges, workLimit, (guard) => {
    guard.Add(BigInt(graph.Nodes.length));
    graph.ComputeCellSize();
    routeAdditionalEdgesWithResourceLimits(ctx, graph, edges, limits);
    guard.Step();
    for (const edge of edges) {
      if (edge.FromTableColumnIndex !== null || edge.ToTableColumnIndex !== null) { guard.Step(); continue; }
      tryStraightEdgeFallbackGuarded(graph, edge, guard);
    }
    const locked: Edge[] = [], regular: Edge[] = [];
    for (const edge of graph.Edges) { guard.Step(); if (!selected.has(edge)) locked.push(edge); }
    for (const edge of edges) {
      guard.Step();
      (isSpecialEdgeForBalancing(graph, edge) ? locked : regular).push(edge);
    }
    balanceRegularEdgesGuarded(graph, locked, regular, guard);
    for (const edge of edges) traceToShapeBorderGuarded(edge, guard);
    reorderDuplicatesInEdgesGuarded(edges, guard);
    guard.Step();
    PlaceNewEdges(ctx, graph, edges);
    guard.Finish();
  });
}
