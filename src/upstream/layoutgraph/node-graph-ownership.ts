// Translated internal/layoutgraph/node_graph_ownership.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { New as invariant } from '../invariant/errors.js';
import { collectRuntimeObjectsContext } from './runtime-objects.js';
export class NodeGraphOwnershipSnapshot {
  constructor(readonly owners: { node: Node; graph: Graph | null }[]) {}
  Restore(): void {
    for (const owner of this.owners) owner.node.Graph = owner.graph;
  }
}
export function SnapshotNodeGraphOwnership(
  ctx: Context,
  graph: Graph | null,
): NodeGraphOwnershipSnapshot {
  if (graph === null)
    throw invariant('node graph ownership snapshot requires a graph');
  const guard = new WorkGuard(
    ctx,
    'NodeGraphOwnershipSnapshot',
    MaxEngineWorkUnits,
  );
  const objects = collectRuntimeObjectsContext(
      graph,
      guard,
      'ownership runtime',
    ),
    owners: { node: Node; graph: Graph | null }[] = [];
  for (const node of objects.nodeOrder) {
    guard.Step();
    owners.push({ node, graph: node.Graph });
  }
  guard.Finish();
  return new NodeGraphOwnershipSnapshot(owners);
}
