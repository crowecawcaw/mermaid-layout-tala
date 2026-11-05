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

function snapshot(node: Node): NodePositionSnapshot {
  return {
    node,
    pointer: node.TopLeft,
    x: node.TopLeft?.X ?? 0,
    y: node.TopLeft?.Y ?? 0,
  };
}
export function captureOptimizerNodePositions(
  nodes: Node[],
  guard: OptimizationWorkGuard,
): NodePositionSnapshot[] {
  if (nodes.length <= 2) {
    let leaves = true;
    for (const node of nodes) {
      if (node == null)
        throw new Error(`TALA ${guard.Location()} found a nil node`);
      if (
        node.Graph === null ||
        node.isContainer ||
        node.isClusterVessel ||
        node.Graph.Sequences.has(node)
      ) {
        leaves = false;
        break;
      }
    }
    if (leaves) {
      const snapshots: NodePositionSnapshot[] = [];
      for (const node of nodes) {
        if (snapshots.some((s) => s.node === node)) continue;
        guard.Step();
        snapshots.push(snapshot(node));
      }
      return snapshots;
    }
  }
  if (nodes.length === 1) {
    const descendants = optimizerDescendants(nodes[0]!, guard),
      snapshots: NodePositionSnapshot[] = [];
    for (const node of [nodes[0]!, ...descendants]) {
      guard.Step();
      snapshots.push(snapshot(node));
    }
    return snapshots;
  }
  const seen = new Set<Node>(),
    snapshots: NodePositionSnapshot[] = [];
  for (const node of nodes) {
    if (node == null)
      throw new Error(`TALA ${guard.Location()} found a nil node`);
    const all = [node, ...optimizerDescendants(node, guard)];
    for (const current of all) {
      if (seen.has(current)) continue;
      if (seen.size >= MaxEngineNodes)
        throw new Error(
          `TALA ${guard.Location()} position snapshot exceeds node limit ${MaxEngineNodes}`,
        );
      guard.Step();
      seen.add(current);
      snapshots.push(snapshot(current));
    }
  }
  return snapshots;
}
export class OptimizerCandidateMovement {
  constructor(
    readonly positions: NodePositionSnapshot[],
    readonly descendantWork: bigint,
  ) {}
  moveAbs(x: number, y: number, guard: OptimizationWorkGuard): void {
    const node = this.positions[0]!.node;
    if (node.TopLeft === null)
      throw new Error(
        `TALA ${guard.Location()} cannot move an unpositioned node`,
      );
    if (node.TopLeft.X === x && node.TopLeft.Y === y) {
      guard.Step();
      return;
    }
    for (let i = 0n; i < this.descendantWork; i++) guard.Step();
    const descendants = this.positions.slice(1);
    for (const position of descendants) {
      guard.Step();
      if (position.node.TopLeft === null)
        throw new Error(
          `TALA ${guard.Location()} cannot move an unpositioned descendant`,
        );
    }
    const dx = x - node.TopLeft.X,
      dy = y - node.TopLeft.Y;
    node.TopLeft.X += dx;
    node.TopLeft.Y += dy;
    for (const position of descendants) {
      guard.Step();
      position.node.TopLeft!.X += dx;
      position.node.TopLeft!.Y += dy;
    }
  }
}
export function captureOptimizerCandidateMovement(
  node: Node,
  guard: OptimizationWorkGuard,
): OptimizerCandidateMovement {
  const before = guard.Used(),
    positions = captureOptimizerNodePositions([node], guard);
  return new OptimizerCandidateMovement(
    positions,
    guard.Used() - before - BigInt(positions.length),
  );
}
export function optimizerSwapPositions(
  a: Node,
  b: Node,
  guard: OptimizationWorkGuard,
): void {
  if (a == null || b == null || a.TopLeft === null || b.TopLeft === null)
    throw new Error(`TALA ${guard.Location()} cannot swap unpositioned nodes`);
  const snapshots = captureOptimizerNodePositions([a, b], guard);
  let complete = false;
  try {
    const x = a.TopLeft.X,
      y = a.TopLeft.Y;
    optimizerMoveNodeAbs(a, b.TopLeft.X, b.TopLeft.Y, guard);
    optimizerMoveNodeAbs(b, x, y, guard);
    complete = true;
  } finally {
    if (!complete) restoreNodePositions(snapshots);
  }
}
export function withOptimizerPositionsSwapped(
  a: Node,
  b: Node,
  guard: OptimizationWorkGuard,
  fn: () => void,
): void {
  const before = guard.Used(),
    snapshots = captureOptimizerNodePositions([a, b], guard),
    work = guard.Used() - before;
  try {
    if (a == null || b == null || a.TopLeft === null || b.TopLeft === null)
      throw new Error(
        `TALA ${guard.Location()} cannot swap unpositioned nodes`,
      );
    for (let i = 0n; i < work; i++) guard.Step();
    const x = a.TopLeft.X,
      y = a.TopLeft.Y;
    optimizerMoveNodeAbs(a, b.TopLeft.X, b.TopLeft.Y, guard);
    optimizerMoveNodeAbs(b, x, y, guard);
    fn();
  } finally {
    restoreNodePositions(snapshots);
  }
}
