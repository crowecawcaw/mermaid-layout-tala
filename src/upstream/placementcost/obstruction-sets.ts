// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { nearestSharedAncestor } from '../layoutgraph/placement-ancestry.js';

export function obstructionSets(
  graph: Graph,
  node: Node,
  adjacent: Node,
): Node[][] {
  const ancestor = nearestSharedAncestor(node, adjacent);
  const added = new Set<Node | null>(),
    sets: Node[][] = [];
  for (const endpoint of [node, adjacent]) {
    let current = endpoint.container();
    for (;;) {
      if (added.has(current)) break;
      sets.push(graph.Containers.get(current) ?? []);
      added.add(current);
      if (current === null) break;
      current = current.container();
      if (current === ancestor) break;
    }
  }
  return sets;
}
