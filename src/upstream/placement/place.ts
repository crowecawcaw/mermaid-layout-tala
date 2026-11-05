// Translated internal/placement/stages.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import { New as invariant } from '../invariant/errors.js';
import { SnapshotNodeGraphOwnership } from '../layoutgraph/node-graph-ownership.js';
import {
  allDescendantNodesGuarded,
  unboundedWork,
} from '../layoutgraph/containment.js';
import { CommonUncleSiblings } from '../proximity/common-uncle.js';
import { orientationContext } from './container-orientation.js';
import { placeNodes } from './place-nodes.js';
export function Place(ctx: Context, graph: Graph | null, seed: bigint): void {
  if (graph === null) throw invariant('Place requires a graph');
  const prior = graph.CommonUncleSiblings;
  let ownership: ReturnType<typeof SnapshotNodeGraphOwnership> | null = null,
    complete = false;
  try {
    graph.CommonUncleSiblings = CommonUncleSiblings(graph);
    ownership = SnapshotNodeGraphOwnership(ctx, graph);
    ctx = orientationContext(ctx, graph);
    placeNodes(ctx, graph, null, seed, null, []);
    const nodes = [];
    for (const node of graph.Nodes) {
      nodes.push(
        node,
        ...allDescendantNodesGuarded(graph, node, true, unboundedWork),
      );
    }
    for (const node of nodes) node.Graph = graph;
    graph.ComputeCellSize();
    graph.turnCost = 0;
    complete = true;
  } finally {
    if (complete) graph.CommonUncleSiblings = new Map();
    else {
      ownership?.Restore();
      graph.CommonUncleSiblings = prior;
    }
  }
}
