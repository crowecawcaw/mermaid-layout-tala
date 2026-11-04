// Translated from internal/proximity/hubs.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
export function AddHubs(ctx: Context, graph: Graph): void {
  validateEngineGraph(ctx, 'AddHubs', graph);
  const guard = new WorkGuard(ctx, 'AddHubs', MaxEngineWorkUnits),
    hubs = new Map<Node, Node[]>();
  for (const node of graph.Nodes) {
    guard.Step();
    let hasConnected = false;
    const spokes: Node[] = [];
    for (const edge of node.Edges) {
      guard.Step();
      const adjacent = node.Adjacent(edge);
      if (adjacent.container() !== node.container()) continue;
      if (adjacent.Edges.length === 1) spokes.push(adjacent);
      else hasConnected = true;
    }
    if (hasConnected && spokes.length > 0) hubs.set(node, spokes);
  }
  guard.Finish();
  graph.Hubs = hubs;
}
