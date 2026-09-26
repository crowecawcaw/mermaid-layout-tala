import { countGraphEdgeCrossings } from './crossings.js';
import type { TalaGraph } from './graph.js';
import { sizedNodeEdgeLength } from './sized-cost.js';
import { nodeSymmetry } from './symmetry.js';

/** The ordinary-node, no-column branch of placementcost.EdgeLength with
 * IncludeNodeSizes and PenalizeDirection enabled. */
export function ordinaryPlacementEdgeLength(graph: TalaGraph, turnCost = graph.turnCost()): number {
  if (graph.edges.some((edge) => edge.fromTableColumnIndex !== undefined
    || edge.toTableColumnIndex !== undefined)) {
    throw new Error('table-column crossing cost is not yet ported');
  }
  let total = 0;
  for (const node of graph.nodes) {
    total += sizedNodeEdgeLength(node, graph, turnCost);
    total -= nodeSymmetry(node, graph) * graph.cellSize * node.edges.length;
  }
  return total + graph.crossingCost() * countGraphEdgeCrossings(graph);
}
