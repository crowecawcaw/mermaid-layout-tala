// Translated from internal/hierarchy/{discovery,placement}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Hierarchy, type EdgeAbduction } from '../layoutgraph/records.js';
import { isHierarchyStructuralEdge } from './eligibility.js';
import { makeSimpleDAG, mapDAGToGraphLevels } from './dag.js';
import { rankDAG } from './rank.js';
import { isValid } from './validity.js';
export function isSource(n: Node): boolean {
  for (const e of n.Edges) {
    if (!isHierarchyStructuralEdge(e)) continue;
    if (
      e.HasSourceArrow() === e.HasTargetArrow() ||
      (e.HasSourceArrow() && e.From === n) ||
      (e.HasTargetArrow() && e.To === n)
    )
      return false;
  }
  return true;
}
export function isSink(n: Node): boolean {
  for (const e of n.Edges) {
    if (!isHierarchyStructuralEdge(e)) continue;
    if (
      e.HasSourceArrow() === e.HasTargetArrow() ||
      (e.HasTargetArrow() && e.From === n) ||
      (e.HasSourceArrow() && e.To === n)
    )
      return false;
  }
  return true;
}
export function build(
  ctx: Context,
  g: Graph,
  force: boolean,
  hierarchicalNodes: Set<Node>,
  abductions: EdgeAbduction[],
): Hierarchy | null {
  if (g.Nodes.length <= 1) return null;
  let sources = 0,
    sinks = 0,
    allTables = true;
  for (const n of g.Nodes) {
    if (!hierarchicalNodes.has(n)) return null;
    allTables = allTables && n.IsTable();
    if (isSource(n)) sources++;
    else if (isSink(n)) sinks++;
  }
  if (!force && (allTables || sources === 0 || sinks === 0)) return null;
  const hierarchy = new Hierarchy(),
    dag = makeSimpleDAG(ctx, g),
    ranks = rankDAG(ctx, dag);
  hierarchy.ReplaceLevels(mapDAGToGraphLevels(g, ranks.nodeToLevel));
  hierarchy.LevelCount = ranks.levelCount;
  return force || isValid(hierarchy, g, abductions, sources, sinks)
    ? hierarchy
    : null;
}
export function RemoveIsolatedMemberships(g: Graph): void {
  for (const node of g.Nodes)
    if (node.Hierarchy && node.Edges.length === 0 && !node.isContainer) {
      node.Hierarchy.Levels().delete(node);
      node.Hierarchy = null;
    }
}
