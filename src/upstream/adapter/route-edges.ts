// D2 RouteEdges adapter, translated from d2talalayout/adapter.go and patch.go.
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
import type { RoutingOptions, RoutingEdge, RoutingNode, RoutingResult } from '../../layout.js';
import { Background, WithCancel } from '../limits/context.js';
import { MaxEngineEdges } from '../limits/work.js';
import { Mirrored, String as LabelPositionString } from '../label/label.js';
import { RouteEdges } from '../routing/standalone-router.js';
import { translateFlowchart } from './flowchart.js';
import { validateResultEdge } from './result-validation.js';

/** Route selected edges on a positioned graph without changing the input. */
export function routeEdges(
  inputNodes: readonly RoutingNode[],
  inputEdges: readonly RoutingEdge[],
  selectedIds: readonly string[],
  options: RoutingOptions = {},
): RoutingResult {
  if (options.context === null) throw new Error('TALA edge routing requires a context');
  if (selectedIds.length > MaxEngineEdges)
    throw new Error(`requested D2 edge count exceeds limit ${MaxEngineEdges}`);
  const indices = new Map<string, number>();
  inputEdges.forEach((edge, i) => {
    if (indices.has(edge.id)) throw new Error('duplicate edge ID');
    indices.set(edge.id, i);
  });
  const selected = new Set<string>();
  for (const id of selectedIds) {
    if (selected.has(id)) throw new Error(`requested edge ${id} is repeated`);
    if (!indices.has(id)) throw new Error(`requested edge ${id} is not in the graph`);
    selected.add(id);
  }
  const { graph, edgeIDs, reversed, lifelines } = translateFlowchart(inputNodes, inputEdges, options, true);
  const ctx = options.context ?? Background;
  const byID = new Map(graph.Edges.map((edge) => [edge.ID, edge]));
  const edges = selectedIds.map((id) => byID.get(edgeIDs[indices.get(id)!]!)!);
  const [workCtx, cancelWork] = ctx.Done() === null ? WithCancel(ctx) : [ctx, () => {}];
  try {
    try {
      RouteEdges(workCtx, graph, edges);
      for (const edge of edges) validateResultEdge(workCtx, edge);
    } catch (error) {
      const canceled = ctx.Err();
      if (canceled) throw new Error(`tala edge routing stopped: ${canceled.message}`, { cause: canceled });
      throw error;
    }
    const result: RoutingResult = {
      nodes: [...inputNodes],
      edges: inputEdges.map((input, index) => {
        const canceled = workCtx.Err();
        if (canceled) throw new Error(`tala edge routing stopped: ${canceled.message}`, { cause: canceled });
        if (!selected.has(input.id)) return input;
        const edge = byID.get(edgeIDs[index]!)!;
        const points = (reversed[index] ? [...edge.Points].reverse() : edge.Points)
          .map((point) => ({ x: point.X, y: point.Y }));
        return {
          ...input,
          ...(lifelines[index] ? { to: input.from } : {}),
          points,
          isCurve: edge.IsCurve,
          ...(edge.Label ? {
            labelPosition: LabelPositionString(reversed[index] ? Mirrored(edge.Label.Position) : edge.Label.Position),
            labelPercentage: reversed[index] ? 1 - edge.LabelPercentage : edge.LabelPercentage,
          } : {}),
        };
      }),
    };
    const canceled = workCtx.Err();
    if (canceled) throw new Error(`tala edge routing canceled before commit: ${canceled.message}`, { cause: canceled });
    return result;
  } finally {
    cancelWork();
  }
}
