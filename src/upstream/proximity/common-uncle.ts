// Translated from internal/proximity/common_uncle.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
export function CommonUncleSiblings(graph: Graph): Map<Node, Node[]> {
  let uncleToCousins = new Map<Node, Node[]>();
  const common = new Map<Node, Node[]>(),
    orderedUncles: Node[] = [];
  for (const container of graph.containerRDFSOrderContext(null, {
    Step() {},
  })) {
    for (const node of graph.Containers.get(container) ?? [])
      for (const edge of node.Edges) {
        const adjacent = node.Adjacent(edge);
        if (adjacent.Container === container.Container) {
          if (!uncleToCousins.has(adjacent)) {
            orderedUncles.push(adjacent);
            uncleToCousins.set(adjacent, []);
          }
          const cousins = uncleToCousins.get(adjacent)!;
          if (!cousins.includes(node)) cousins.push(node);
        }
      }
    for (const uncle of orderedUncles) {
      const siblings = uncleToCousins.get(uncle) ?? [];
      if (siblings.length < 2) continue;
      for (const sibling of siblings) {
        const existing = common.get(sibling);
        if (existing === undefined || existing.length < siblings.length)
          common.set(sibling, siblings);
      }
    }
    uncleToCousins = new Map();
  }
  return common;
}
