// Translated from internal/layoutgraph/transaction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import { WorkGuard, MaxTransactionOverlapReferences } from '../limits/work.js';
import { TableNodeGap, NodeGap } from './geometry-policy.js';
import { New as invariant } from '../invariant/errors.js';
import { DoesOverlapExact, doesOverlap } from './node-spatial.js';
export function transactionFinite(value: number): boolean {
  return Number.isFinite(value);
}
export function transactionNodeHasFiniteBox(node: Node | null): boolean {
  return (
    node !== null &&
    node.TopLeft !== null &&
    transactionFinite(node.TopLeft.X) &&
    transactionFinite(node.TopLeft.Y) &&
    transactionFinite(node.Width) &&
    transactionFinite(node.Height) &&
    transactionFinite(node.TopLeft.X + node.Width) &&
    transactionFinite(node.TopLeft.Y + node.Height) &&
    node.Width >= 0 &&
    node.Height >= 0
  );
}
function goNumber(value: number): string {
  return Number.isNaN(value)
    ? 'NaN'
    : value === Infinity
      ? '+Inf'
      : value === -Infinity
        ? '-Inf'
        : String(value);
}
export function transactionSweepPadding(g: Graph, guard: WorkGuard): number {
  let padding = TableNodeGap,
    maxMargin = 0,
    maxLoopOffset = 0;
  const edges = new Set<Edge>();
  for (const node of g.Nodes) {
    guard.Step();
    if (node === null) throw new Error('TALA transaction contains a nil node');
    if (node.TopLeft !== null && !transactionNodeHasFiniteBox(node)) {
      if (node.isContainer && (g.Containers.get(node)?.length ?? 0) === 0)
        continue;
      throw invariant(
        `transaction node ${node.ID} has invalid geometry (x=${goNumber(node.TopLeft.X)} y=${goNumber(node.TopLeft.Y)} width=${goNumber(node.Width)} height=${goNumber(node.Height)})`,
      );
    }
    for (const margin of [
      node.margin.top,
      node.margin.right,
      node.margin.bottom,
      node.margin.left,
    ])
      if (!transactionFinite(margin))
        throw invariant(`transaction node ${node.ID} has non-finite margin`);
    maxMargin = Math.max(
      maxMargin,
      node.margin.top,
      node.margin.right,
      node.margin.bottom,
      node.margin.left,
    );
    for (const offset of node.LoopOffsets.values()) {
      guard.Step();
      if (!transactionFinite(offset))
        throw invariant(
          `transaction node ${node.ID} has a non-finite loop offset`,
        );
      if (offset > maxLoopOffset) maxLoopOffset = offset;
    }
    for (const edge of node.Edges) {
      guard.Step();
      if (edge === null)
        throw new Error(`TALA transaction node ${node.ID} contains a nil edge`);
      edges.add(edge);
    }
  }
  for (const edge of g.Edges) {
    guard.Step();
    if (edge === null) throw new Error('TALA transaction contains a nil edge');
    edges.add(edge);
  }
  for (const edge of edges) {
    guard.Step();
    padding = Math.max(padding, edge.MinWidth, edge.MinHeight);
  }
  padding = Math.max(padding, 2 * maxMargin, NodeGap + 2 * maxLoopOffset);
  if (!transactionFinite(padding))
    throw invariant('transaction overlap padding is non-finite');
  guard.Finish();
  return padding;
}
export function buildTransactionOverlaps(
  g: Graph,
  guard: WorkGuard,
): [Map<Node, Set<Node>>, Map<Node, Set<Node>>] {
  return buildTransactionOverlapsWithReferenceLimit(
    g,
    guard,
    MaxTransactionOverlapReferences,
  );
}
export function buildTransactionOverlapsWithReferenceLimit(
  g: Graph,
  guard: WorkGuard,
  referenceLimit: bigint,
): [Map<Node, Set<Node>>, Map<Node, Set<Node>>] {
  const padding = transactionSweepPadding(g, guard),
    placed: { node: Node; index: number }[] = [];
  for (let index = 0; index < g.Nodes.length; index++) {
    const node = g.Nodes[index]!;
    guard.Step();
    if (node.TopLeft !== null && transactionNodeHasFiniteBox(node))
      placed.push({ node, index });
  }
  guard.Step();
  placed.sort((left, right) => {
    if (left.node.TopLeft!.X !== right.node.TopLeft!.X) {
      if (left.node.TopLeft!.X < right.node.TopLeft!.X) return -1;
      if (right.node.TopLeft!.X < left.node.TopLeft!.X) return 1;
      return 0;
    }
    if (left.node.ID !== right.node.ID)
      return left.node.ID < right.node.ID ? -1 : 1;
    return left.index < right.index ? -1 : left.index > right.index ? 1 : 0;
  });
  const existingOverlaps = new Map<Node, Set<Node>>(),
    existingExactOverlaps = new Map<Node, Set<Node>>();
  let retainedReferences = 0n;
  const addPair = (
    overlaps: Map<Node, Set<Node>>,
    first: Node,
    second: Node,
  ): void => {
    if (referenceLimit < 2n || retainedReferences > referenceLimit - 2n)
      throw new Error(
        `TALA transaction overlap references exceed limit ${referenceLimit}`,
      );
    if (!overlaps.has(first)) overlaps.set(first, new Set());
    if (!overlaps.has(second)) overlaps.set(second, new Set());
    overlaps.get(first)!.add(second);
    overlaps.get(second)!.add(first);
    retainedReferences += 2n;
  };
  let active: Node[] = [];
  for (const current of placed) {
    guard.Step();
    const kept: Node[] = [];
    for (const other of active) {
      guard.Step();
      if (other === current.node) continue;
      if (other.TopLeft!.X + other.Width + padding <= current.node.TopLeft!.X)
        continue;
      kept.push(other);
      if (
        other.TopLeft!.Y >=
          current.node.TopLeft!.Y + current.node.Height + padding ||
        current.node.TopLeft!.Y >= other.TopLeft!.Y + other.Height + padding
      )
        continue;
      if (DoesOverlapExact(current.node, other))
        addPair(existingExactOverlaps, current.node, other);
      if (doesOverlap(current.node, other) || doesOverlap(other, current.node))
        addPair(existingOverlaps, current.node, other);
    }
    kept.push(current.node);
    active = kept;
  }
  guard.Finish();
  return [existingOverlaps, existingExactOverlaps];
}
