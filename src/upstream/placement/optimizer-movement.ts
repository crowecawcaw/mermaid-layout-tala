// Translated internal/placement/optimization_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes } from '../limits/work.js';
import { restoreNodePositions, type NodePositionSnapshot } from './types.js';
export function optimizerDescendants(
  node: Node | null,
  guard: OptimizationWorkGuard,
): Node[] {
  if (node === null || node.Graph === null)
    throw new Error(
      `TALA ${guard.Location()} movement requires a node with a graph`,
    );
  const graph = node.Graph,
    seen = new Set<Node>([node]),
    stack: Node[] = [];
  const push = (child: Node): void => {
    guard.Step();
    if (child == null)
      throw new Error(`TALA ${guard.Location()} found a nil descendant`);
    if (seen.has(child)) return;
    if (seen.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} descendant count exceeds limit ${MaxEngineNodes}`,
      );
    seen.add(child);
    stack.push(child);
  };
  const pushGroup = (children: Node[], kind: string): void => {
    if (children.length > MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} ${kind} child references exceed node limit ${MaxEngineNodes}`,
      );
    for (let i = children.length - 1; i >= 0; i--) push(children[i]!);
  };
  const pushChildren = (parent: Node): void => {
    const sequence = graph.Sequences.get(parent);
    if (sequence !== undefined) pushGroup(sequence.Nodes, 'sequence');
    if (parent.isClusterVessel) {
      const cluster = graph.Clusters.get(parent);
      if (cluster !== undefined) pushGroup(cluster.Nodes, 'cluster');
    }
    if (parent.isContainer)
      pushGroup(graph.Containers.get(parent) ?? [], 'container');
  };
  pushChildren(node);
  const descendants: Node[] = [];
  while (stack.length > 0) {
    guard.Step();
    const current = stack.pop()!;
    descendants.push(current);
    pushChildren(current);
  }
  return descendants;
}
export function optimizerMoveNodeAbs(
  node: Node | null,
  x: number,
  y: number,
  guard: OptimizationWorkGuard,
): void {
  if (node === null || node.TopLeft === null)
    throw new Error(
      `TALA ${guard.Location()} cannot move an unpositioned node`,
    );
  if (node.TopLeft.X === x && node.TopLeft.Y === y) {
    guard.Step();
    return;
  }
  if (
    node.Graph !== null &&
    !node.isContainer &&
    !node.isClusterVessel &&
    !node.Graph.Sequences.has(node)
  ) {
    node.TopLeft.X += x - node.TopLeft.X;
    node.TopLeft.Y += y - node.TopLeft.Y;
    return;
  }
  const descendants = optimizerDescendants(node, guard);
  const snapshots: NodePositionSnapshot[] = [
    { node, pointer: node.TopLeft, x: node.TopLeft.X, y: node.TopLeft.Y },
  ];
  for (const child of descendants) {
    guard.Step();
    if (child.TopLeft === null)
      throw new Error(
        `TALA ${guard.Location()} cannot move an unpositioned descendant`,
      );
    snapshots.push({
      node: child,
      pointer: child.TopLeft,
      x: child.TopLeft.X,
      y: child.TopLeft.Y,
    });
  }
  let complete = false;
  try {
    const dx = x - node.TopLeft.X,
      dy = y - node.TopLeft.Y;
    node.TopLeft.X += dx;
    node.TopLeft.Y += dy;
    for (const child of descendants) {
      guard.Step();
      child.TopLeft!.X += dx;
      child.TopLeft!.Y += dy;
    }
    complete = true;
  } finally {
    if (!complete) restoreNodePositions(snapshots);
  }
}
