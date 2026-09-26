import type { TalaGraph } from './graph.js';

/** Port of placementcost.ContainerAlignmentCost for ordinary containers. */
export function containerAlignmentCost(graph: TalaGraph): number {
  let cost = 0;
  for (let i = 0; i < graph.nodes.length - 1; i++) {
    const first = graph.nodes[i]!;
    if (!first.isGroup || !first.topLeft) continue;
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const second = graph.nodes[j]!;
      if (!second.isGroup || !second.topLeft || first.parent !== second.parent
        || first.width !== second.width || first.height !== second.height) continue;
      if (first.topLeft.x !== second.topLeft.x && first.topLeft.y !== second.topLeft.y) {
        cost += graph.nonCenterPortCost();
      }
    }
  }
  return cost;
}
