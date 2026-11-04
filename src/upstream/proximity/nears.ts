// Translated from internal/proximity/nears.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import { New as invariant } from '../invariant/errors.js';
export const sortByID = (nodes: Node[]): Node[] =>
  nodes.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
export function groupVessel(node: Node | null): Node | null {
  if (node === null) return null;
  if (node.Cluster !== null) return node.Cluster.Vessel;
  if (node.Sequence !== null) return node.Sequence.Vessel;
  return node;
}
export function isDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: WorkGuard,
): boolean {
  for (;;) {
    guard.Step();
    if (descendant === ancestor) return true;
    if (descendant === null) return false;
    if (descendant.Container !== null) descendant = descendant.Container;
    else if (descendant.Cluster !== null)
      descendant = descendant.Cluster.Vessel;
    else if (descendant.Sequence !== null)
      descendant = descendant.Sequence.Vessel;
    else descendant = null;
  }
}
export function AssignNears(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  abductions: EdgeAbduction[],
): void {
  assignNearsWithWorkLimit(ctx, graph, root, abductions, MaxEngineWorkUnits);
}
export function assignNearsWithWorkLimit(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  abductions: EdgeAbduction[],
  workLimit: bigint,
): void {
  const guard = new WorkGuard(ctx, 'AssignNears', workLimit),
    uncles = new Map<Node, Set<Node>>();
  for (const abduction of abductions) {
    guard.Step();
    if (abduction === null)
      throw invariant('nil edge abduction while assigning nears');
    const originallyFrom = groupVessel(abduction.OriginallyFrom),
      originallyTo = groupVessel(abduction.OriginallyTo);
    let uncle: Node | null = null,
      connected: Node | null = null;
    for (const node of graph.Containers.get(root) ?? []) {
      guard.Step();
      const fromDescendant = isDescendantOf(originallyFrom, node, guard),
        toDescendant = isDescendantOf(originallyTo, node, guard);
      if (fromDescendant) {
        uncle = abduction.CurrentTo;
        connected = node;
        break;
      } else if (toDescendant) {
        uncle = abduction.CurrentFrom;
        connected = node;
        break;
      }
    }
    if (uncle !== null && connected !== null) {
      if (!uncles.has(uncle)) uncles.set(uncle, new Set());
      uncles.get(uncle)!.add(connected);
    }
  }
  const orderedUncles: Node[] = [];
  for (const uncle of uncles.keys()) {
    guard.Step();
    orderedUncles.push(uncle);
  }
  sortByID(orderedUncles);
  const originalNears = new Map<Node, Set<Node>>(),
    replacementNears = new Map<Node, Set<Node>>();
  let nearReferences = 0;
  const limitError = () =>
    new Error(
      `TALA AssignNears topology references exceed limit ${maxEngineTopologyReferences}`,
    );
  const mutableNears = (node: Node): Set<Node> => {
    const existing = replacementNears.get(node);
    if (existing !== undefined) return existing;
    if (node.Nears.size > maxEngineTopologyReferences - nearReferences)
      throw limitError();
    nearReferences += node.Nears.size;
    originalNears.set(node, node.Nears);
    const replacement = new Set<Node>();
    for (const near of node.Nears) {
      guard.Step();
      replacement.add(near);
    }
    replacementNears.set(node, replacement);
    return replacement;
  };
  const hasConnection = (node: Node, other: Node): boolean => {
    for (const edge of node.Edges) {
      guard.Step();
      if (edge !== null && node.Adjacent(edge) === other) return true;
    }
    return false;
  };
  for (const uncle of orderedUncles) {
    const nodes: Node[] = [];
    for (const node of uncles.get(uncle)!) {
      guard.Step();
      nodes.push(node);
    }
    sortByID(nodes);
    if (nodes.length === 1) continue;
    for (let i = 0; i < nodes.length; i++) {
      const first = nodes[i]!;
      for (const second of nodes.slice(i + 1)) {
        guard.Step();
        if (first.Hierarchy !== null || second.Hierarchy !== null) continue;
        if (hasConnection(first, second)) continue;
        const firstNears = mutableNears(first),
          secondNears = mutableNears(second);
        if (!firstNears.has(second)) {
          if (nearReferences >= maxEngineTopologyReferences) throw limitError();
          firstNears.add(second);
          nearReferences++;
        }
        if (!secondNears.has(first)) {
          if (nearReferences >= maxEngineTopologyReferences) throw limitError();
          secondNears.add(first);
          nearReferences++;
        }
      }
    }
  }
  guard.Finish();
  let complete = false;
  try {
    for (const node of sortByID([...replacementNears.keys()])) {
      node.Nears = replacementNears.get(node)!;
      guard.Finish();
    }
    complete = true;
  } finally {
    if (!complete)
      for (const [node, nears] of originalNears) node.Nears = nears;
  }
}
