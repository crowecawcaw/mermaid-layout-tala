// Translated from internal/layoutgraph/positioned_validation.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  MaxEngineNodes,
  MaxEngineEdges,
  MaxEngineRoutePoints,
} from '../limits/work.js';
import type { Graph } from './graph.js';
import type { Edge } from './edge.js';
import { validateEngineGraph } from './topology-preflight.js';
export function ValidatePositionedGraphSelection(
  ctx: Context,
  operation: string,
  graph: Graph,
  extraEdges: Edge[],
): void {
  validateEngineGraph(ctx, operation, graph);
  if (!ctx) throw new Error(`TALA ${operation} requires a context`);
  const initial = ctx.Err();
  if (initial)
    throw new Error(`${operation}: ${initial.message}`, { cause: initial });
  if (!graph) throw new Error(`TALA ${operation} requires a graph`);
  if (graph.Nodes.length > MaxEngineNodes)
    throw new Error(
      `TALA ${operation} node count exceeds limit ${MaxEngineNodes}`,
    );
  if (graph.Edges.length > MaxEngineEdges)
    throw new Error(
      `TALA ${operation} edge count exceeds limit ${MaxEngineEdges}`,
    );
  if (extraEdges.length > MaxEngineEdges)
    throw new Error(
      `TALA ${operation} requested edge count exceeds limit ${MaxEngineEdges}`,
    );
  let checks = 0;
  const check = () => {
    if (++checks % 64 === 0) {
      const error = ctx.Err();
      if (error)
        throw new Error(`${operation}: ${error.message}`, { cause: error });
    }
  };
  for (let i = 0; i < graph.Nodes.length; i++) {
    check();
    const node = graph.Nodes[i];
    if (!node)
      throw new Error(`TALA ${operation} graph node at index ${i} is nil`);
    if (!node.TopLeft)
      throw new Error(
        `TALA ${operation} graph node ${node.ID} has no position`,
      );
    if (node.Cluster && !node.Cluster.Vessel)
      throw new Error(
        `TALA ${operation} graph node ${node.ID} has a cluster without a vessel`,
      );
    if (node.Sequence && !node.Sequence.Vessel)
      throw new Error(
        `TALA ${operation} graph node ${node.ID} has a sequence without a vessel`,
      );
  }
  const graphSeen = new Set<Edge>(),
    requestedSeen = new Set<Edge>(),
    validated = new Set<Edge>();
  let routePoints = 0;
  const validate = (
    edge: Edge,
    index: number,
    kind: string,
    seen: Set<Edge>,
  ) => {
    check();
    if (!edge)
      throw new Error(`TALA ${operation} ${kind} at index ${index} is nil`);
    if (seen.has(edge))
      throw new Error(
        `TALA ${operation} ${kind} at index ${index} repeats edge ${edge.ID}`,
      );
    seen.add(edge);
    if (validated.has(edge)) return;
    validated.add(edge);
    if (!edge.From || !edge.To)
      throw new Error(
        `TALA ${operation} edge ${edge.ID} has missing endpoints`,
      );
    if (edge.Points.length > MaxEngineRoutePoints - routePoints)
      throw new Error(
        `TALA ${operation} route point count exceeds limit ${MaxEngineRoutePoints}`,
      );
    routePoints += edge.Points.length;
    for (let i = 0; i < edge.Points.length; i++) {
      check();
      if (!edge.Points[i])
        throw new Error(
          `TALA ${operation} edge ${edge.ID} route point at index ${i} is nil`,
        );
    }
    if (
      (edge.Label || edge.SourceArrowheadLabel || edge.TargetArrowheadLabel) &&
      edge.Points.length < 2
    )
      throw new Error(
        `TALA ${operation} labeled edge ${edge.ID} requires at least two route points`,
      );
  };
  graph.Edges.forEach((e, i) => validate(e, i, 'graph edge', graphSeen));
  extraEdges.forEach((e, i) => validate(e, i, 'requested edge', requestedSeen));
  const error = ctx.Err();
  if (error)
    throw new Error(`${operation}: ${error.message}`, { cause: error });
}
