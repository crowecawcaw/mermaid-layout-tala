// Translated internal/placement/types.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import {
  MaxEngineNodes,
  MaxEngineWorkUnits,
  MaxGraphSize,
  WorkGuard,
} from '../limits/work.js';

export const maxCompactionCandidateCount = MaxGraphSize + 3;
export interface NodePositionSnapshot {
  node: Node;
  pointer: Point | null;
  x: number;
  y: number;
}
export function restoreNodePositions(snapshots: NodePositionSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.pointer !== null) {
      snapshot.pointer.X = snapshot.x;
      snapshot.pointer.Y = snapshot.y;
    }
    snapshot.node.TopLeft = snapshot.pointer;
  }
}
export function snapshotNodePositionsContext(
  ctx: Context,
  location: string,
  nodes: (Node | null)[],
): NodePositionSnapshot[] {
  const guard = new WorkGuard(ctx, location, MaxEngineWorkUnits),
    seen = new Set<Node>();
  const snapshots: NodePositionSnapshot[] = [],
    queue: { node: Node; graph: Graph | null }[] = [];
  const enqueue = (node: Node | null, graph: Graph | null): void => {
    if (node === null || seen.has(node)) return;
    if (seen.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${location} unique node count exceeds limit ${MaxEngineNodes}`,
      );
    guard.Step();
    seen.add(node);
    snapshots.push({
      node,
      pointer: node.TopLeft,
      x: node.TopLeft?.X ?? 0,
      y: node.TopLeft?.Y ?? 0,
    });
    queue.push({ node, graph });
  };
  for (const node of nodes) if (node !== null) enqueue(node, node.Graph);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!,
      graph = current.graph,
      node = current.node;
    if (graph === null) continue;
    if (node.isContainer)
      for (const child of graph.Containers.get(node) ?? [])
        enqueue(child, graph);
    if (node.isClusterVessel)
      for (const child of graph.Clusters.get(node)?.Nodes ?? [])
        enqueue(child, graph);
    for (const child of graph.Sequences.get(node)?.Nodes ?? [])
      enqueue(child, graph);
  }
  guard.Finish();
  return snapshots;
}
export function nonNilEquals(first: Point, second: Point): boolean {
  return first.X === second.X && first.Y === second.Y;
}
export function roundToPreviousCellSize(
  value: number,
  cellSize: number,
): number {
  return Math.floor(value / cellSize) * cellSize;
}
export function roundToNearestCellSize(
  value: number,
  cellSize: number,
): number {
  return Round(value / cellSize) * cellSize;
}
export function numPointsWithinManhattanDistance(distance: number): number {
  return Math.ceil(Math.pow(distance, 2) + Math.pow(distance + 1, 2));
}
