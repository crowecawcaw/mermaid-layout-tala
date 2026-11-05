// Translated internal/placement/node_placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Graph } from '../layoutgraph/graph.js';
import { New as invariant } from '../invariant/errors.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
export function validatePlacedNodes(root: Node | null, nodes: Node[]): void {
  for (const n of nodes)
    if (n.TopLeft === null)
      throw invariant(
        `node ${n.ID} was not placed under container ${root?.ID ?? 0n}`,
      );
}
export function validateCellSize(graph: Graph): void {
  const c = graph.CellSize;
  if (c < 1 || !Number.isFinite(c) || Math.trunc(c) !== c)
    throw invariant(`invalid cell size ${c}`);
}
export function validateGridAlignment(graph: Graph): void {
  validateCellSize(graph);
  for (const n of graph.Nodes) {
    if (n.FixedTopLeft !== null) continue;
    if (n.TopLeft === null) throw invariant(`node ${n.ID} has no position`);
    if (
      n.TopLeft.X % graph.CellSize !== 0 ||
      n.TopLeft.Y % graph.CellSize !== 0
    )
      throw invariant(
        `node ${n.ID} at (${n.TopLeft.X}, ${n.TopLeft.Y}) is not aligned to cell size ${graph.CellSize}`,
      );
  }
}
export function PlaceChildrenOrder(
  ctx: Context,
  nodes: (Node | null)[],
  abductions: (EdgeAbduction | null)[] | null,
): Node[] {
  const check = (): void => {
    const err = ctx.Err();
    if (err !== null)
      throw new Error(`PlaceChildrenOrder: ${err.message}`, { cause: err });
  };
  check();
  const expected = new Set<Node>(),
    connected = new Map<Node, Set<Node>>(),
    abs = abductions ?? [];
  for (const node of nodes) {
    check();
    if (node === null) throw invariant('container has a nil child');
    if (expected.has(node))
      throw invariant(`container has duplicate child ${nodeDebugID(node)}`);
    expected.add(node);
    connected.set(node, new Set());
  }
  for (const ab of abs) {
    check();
    if (ab === null) throw invariant('child ordering has a nil edge abduction');
    const from = ab.CurrentFrom,
      to = ab.CurrentTo;
    if (
      from !== null &&
      to !== null &&
      expected.has(from) &&
      expected.has(to)
    ) {
      connected.get(from)!.add(to);
      connected.get(to)!.add(from);
    }
  }
  const ordered: Node[] = [],
    orderedSet = new Set<Node>();
  const append = (node: Node): void => {
    ordered.push(node);
    orderedSet.add(node);
    connected.delete(node);
  };
  for (const node of nodes) {
    check();
    if (connected.get(node!)!.size === 0) append(node!);
  }
  while (ordered.length < nodes.length) {
    check();
    let degree = nodes.length + 1,
      start: Node | null = null;
    for (const node of nodes) {
      const adjacent = connected.get(node!);
      if (adjacent !== undefined && adjacent.size < degree) {
        degree = adjacent.size;
        start = node;
      }
    }
    if (start === null)
      throw invariant('could not order all container children');
    const visited = new Set<Node>(),
      queue: Node[] = [start];
    while (queue.length > 0) {
      check();
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (orderedSet.has(current)) continue;
      append(current);
      for (const ab of abs) {
        let adjacent: Node | null = null;
        if (ab!.CurrentFrom === current) adjacent = ab!.CurrentTo;
        else if (ab!.CurrentTo === current) adjacent = ab!.CurrentFrom;
        if (adjacent !== null && expected.has(adjacent)) queue.push(adjacent);
      }
    }
  }
  check();
  return ordered;
}
