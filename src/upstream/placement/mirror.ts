// Translated internal/placement/direct.go and internal/layoutgraph/node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Tree } from '../layoutgraph/records.js';
import {
  Orientation as O,
  GetOpposite,
  IsHorizontal,
  IsVertical,
} from '../geo/orientation.js';
import { MaxEngineWorkUnits, WorkGuard } from '../limits/work.js';
import { allReachableNodesGuarded } from '../layoutgraph/reachability.js';
import { positionContainerChildren } from '../layoutgraph/node-geometry.js';
import { restoreNodePositions, snapshotNodePositionsContext } from './types.js';

export function mirrorNode(node: Node, x: boolean, y: boolean): void {
  const offsets = node.LoopOffsets;
  if (x)
    node.TopLeft!.X =
      -node.TopLeft!.X -
      node.Width +
      (offsets.get(O.Left) ?? 0) -
      (offsets.get(O.Right) ?? 0);
  if (y)
    node.TopLeft!.Y =
      -node.TopLeft!.Y -
      node.Height +
      (offsets.get(O.Top) ?? 0) -
      (offsets.get(O.Bottom) ?? 0);
}
function walkRDFS(node: Node, apply: (node: Node) => void): void {
  if (node.isContainer)
    for (const child of node.Graph!.Containers.get(node) ?? [])
      walkRDFS(child, apply);
  if (node.isClusterVessel)
    for (const child of node.Graph!.Clusters.get(node)!.Nodes)
      walkRDFS(child, apply);
  else {
    const sequence = node.Graph!.Sequences.get(node);
    if (sequence !== undefined)
      for (const child of sequence.Nodes) walkRDFS(child, apply);
  }
  apply(node);
}
export function mirrorAxes(
  ctx: Context,
  graph: Graph,
  mirrorX: boolean,
  mirrorY: boolean,
): void {
  const guard = new WorkGuard(
    ctx,
    'MirrorAxesReachability',
    MaxEngineWorkUnits,
  );
  const reachableContainers = new Set<Node | null>(),
    visited = new Set<Node>();
  for (const node of graph.Nodes) {
    if (visited.has(node)) continue;
    const reachable = allReachableNodesGuarded(
      node,
      true,
      true,
      false,
      null,
      guard,
    );
    for (const current of reachable) {
      visited.add(current);
      reachableContainers.add(current.Container);
    }
  }
  guard.Finish();
  const snapshots = snapshotNodePositionsContext(
      ctx,
      'MirrorAxes',
      graph.Nodes,
    ),
    orientations = new Map<Tree, O>();
  for (const snapshot of snapshots) {
    const tree = graph.NodeToTree.get(snapshot.node);
    if (tree !== undefined) orientations.set(tree, tree.Orientation);
  }
  let complete = false;
  try {
    const mirrored = new Set<Node>();
    let mutationError: unknown = null;
    const apply = (node: Node): void => {
      if (mutationError !== null) return;
      try {
        guard.Step();
        if (mirrored.has(node)) return;
        if (reachableContainers.has(node.container())) {
          mirrorNode(node, mirrorX, mirrorY);
          mirrored.add(node);
          guard.Finish();
          const tree = graph.NodeToTree.get(node);
          if (
            tree !== undefined &&
            ((mirrorX && IsHorizontal(tree.Orientation)) ||
              (mirrorY && IsVertical(tree.Orientation)))
          ) {
            tree.Orientation = GetOpposite(tree.Orientation);
            guard.Finish();
          }
        }
        positionContainerChildren(node, true);
        guard.Finish();
      } catch (error) {
        mutationError = error;
      }
    };
    for (const node of graph.Nodes) {
      if (mutationError !== null) break;
      if (!mirrored.has(node)) walkRDFS(node, apply);
    }
    if (mutationError !== null) throw mutationError;
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) {
      restoreNodePositions(snapshots);
      for (const [tree, orientation] of orientations)
        tree.Orientation = orientation;
    }
  }
}
