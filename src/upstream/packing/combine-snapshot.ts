// Translated internal/packing/combine_snapshot.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxEngineNodes,
} from '../limits/work.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { snapshotPointer } from '../layoutgraph/transaction-snapshot.js';
import type { Point } from '../geo/point.js';
export interface CombineNodePositionSnapshot {
  node: Node;
  topLeft: ReturnType<typeof snapshotPointer<Point>>;
}
export function restoreCombineNodePositions(
  snapshots: CombineNodePositionSnapshot[],
): void {
  for (const snapshot of snapshots)
    snapshot.node.TopLeft = snapshot.topLeft.restore();
}
export function snapshotCombineNodePositions(
  ctx: Context,
  nodes: Node[],
): CombineNodePositionSnapshot[] {
  const guard = new WorkGuard(ctx, 'CombineSubgraphs', MaxEngineWorkUnits),
    seen = new Set<Node>(),
    snapshots: CombineNodePositionSnapshot[] = [],
    queue: { node: Node; graph: Graph | null }[] = [];
  const enqueue = (node: Node | null, graph: Graph | null) => {
    if (node === null || seen.has(node)) return;
    if (seen.size >= MaxEngineNodes)
      throw new Error(
        `TALA CombineSubgraphs unique node count exceeds limit ${MaxEngineNodes}`,
      );
    guard.Step();
    seen.add(node);
    snapshots.push({ node, topLeft: snapshotPointer(node.TopLeft) });
    queue.push({ node, graph });
  };
  for (const node of nodes) if (node !== null) enqueue(node, node.Graph);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    if (current.graph === null) continue;
    const { node, graph } = current;
    if (node.IsContainer())
      for (const child of graph.Containers.get(node) ?? [])
        enqueue(child, graph);
    if (node.IsClusterVessel()) {
      const cluster = graph.Clusters.get(node);
      if (cluster != null)
        for (const child of cluster.Nodes) enqueue(child, graph);
    }
    const sequence = graph.Sequences.get(node);
    if (sequence != null)
      for (const child of sequence.Nodes) enqueue(child, graph);
  }
  guard.Finish();
  return snapshots;
}
