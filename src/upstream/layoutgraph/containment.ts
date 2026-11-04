// Translated containment helpers from internal/layoutgraph/{graph,node}.go.
// D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { New as invariant } from '../invariant/errors.js';
import { MaxEngineNodes } from '../limits/work.js';
export const unboundedWork = { Step(): void {}, Finish(): void {} };
export function allDescendantNodesGuarded(
  g: Graph,
  node: Node | null,
  includeClusterNodes: boolean,
  guard: { Step(): void; Finish(): void },
): Node[] {
  const seen = new Set<Node>(),
    stack: { node: Node; emit: boolean }[] = [],
    descendants: Node[] = [];
  if (node !== null) seen.add(node);
  const pushChildren = (parent: Node | null): void => {
    const sequence = g.Sequences.get(parent!);
    if (sequence)
      for (let i = sequence.Nodes.length - 1; i >= 0; i--) {
        guard.Step();
        stack.push({ node: sequence.Nodes[i]!, emit: includeClusterNodes });
      }
    if (parent !== null && parent.isClusterVessel) {
      const cluster = g.Clusters.get(parent);
      if (cluster)
        for (let i = cluster.Nodes.length - 1; i >= 0; i--) {
          guard.Step();
          stack.push({ node: cluster.Nodes[i]!, emit: includeClusterNodes });
        }
    }
    if (parent === null || parent.isContainer) {
      const children = g.Containers.get(parent) ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        guard.Step();
        stack.push({ node: children[i]!, emit: true });
      }
    }
  };
  pushChildren(node);
  while (stack.length > 0) {
    guard.Step();
    const current = stack.pop()!;
    if (current.node === null || seen.has(current.node)) continue;
    seen.add(current.node);
    if (current.emit) descendants.push(current.node);
    pushChildren(current.node);
  }
  guard.Finish();
  return descendants;
}
export function ancestorsOfGuarded(
  node: Node | null,
  guard: { Step(): void; Finish(): void },
): Node[] {
  const seen = new Set<Node>(),
    nodes: Node[] = [];
  let current = node;
  while (current !== null) {
    guard.Step();
    if (seen.has(current)) throw invariant('cycle in transaction ancestry');
    seen.add(current);
    if (seen.size > MaxEngineNodes)
      throw invariant('transaction ancestry exceeds node limit');
    if (current !== node) nodes.push(current);
    if (current.Container !== null) current = current.Container;
    else if (current.Cluster !== null) current = current.Cluster.Vessel;
    else if (current.Sequence !== null) current = current.Sequence.Vessel;
    else break;
  }
  guard.Finish();
  return nodes;
}
export function containerLevel(n: Node): number {
  let level = 0;
  for (let curr: Node | null = n; curr !== null; curr = curr.container())
    level++;
  return level;
}
export function subgraphContainer(nodes: Node[]): Node | null {
  let root: Node | null = null,
    minLevel = 9223372036854775807;
  for (const n of nodes) {
    const c = n.container();
    if (c === null) return null;
    const level = containerLevel(c);
    if (level < minLevel) {
      minLevel = level;
      root = c;
    }
  }
  return root;
}
export function fixedOrigin(node: Node): Point | null {
  return node.TopLeft !== null && node.FixedTopLeft !== null
    ? new Point(
        node.TopLeft.X - node.FixedTopLeft.X,
        node.TopLeft.Y - node.FixedTopLeft.Y,
      )
    : null;
}
export function nodesFixedOrigin(nodes: Node[]): Point | null {
  const container = subgraphContainer(nodes);
  for (const child of nodes) {
    if (child.container() !== container) continue;
    const p = fixedOrigin(child);
    if (p !== null) return p;
  }
  return null;
}
export function containerFixedOrigin(
  g: Graph,
  container: Node | null,
): Point | null {
  for (const n of g.Nodes) {
    if (n.container() !== container) continue;
    const p = fixedOrigin(n);
    if (p !== null) return p;
  }
  return null;
}
export function isPointPastFixedOrigin(
  node: Node,
  x: number,
  y: number,
  includeSizes: boolean,
): boolean {
  const origin = containerFixedOrigin(node.Graph!, node.container());
  if (origin === null) return false;
  if (!includeSizes) {
    origin.X = Round(origin.X / node.Graph!.CellSize);
    origin.Y = Round(origin.Y / node.Graph!.CellSize);
  }
  return x < origin.X || y < origin.Y;
}
export function moveNodeWithChildren(n: Node, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  n.Translate(dx, dy);
  for (const child of allDescendantNodesGuarded(
    n.Graph!,
    n,
    true,
    unboundedWork,
  ))
    child.Translate(dx, dy);
}
export function moveNodeAbsWithChildren(n: Node, x: number, y: number): void {
  if (n.TopLeft !== null && n.TopLeft.X === x && n.TopLeft.Y === y) return;
  moveNodeWithChildren(n, x - n.TopLeft!.X, y - n.TopLeft!.Y);
}
