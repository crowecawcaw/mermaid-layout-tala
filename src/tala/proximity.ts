import { TalaGraph, type TalaNode } from './graph.js';

/** Port of upstream proximity.AddHubs for a single containing layout group. */
export function addHubs(graph: TalaGraph): void {
  graph.hubs.clear();
  for (const node of graph.nodes) {
    let hasConnected = false;
    const spokes: TalaNode[] = [];
    for (const edge of node.edges) {
      const adjacent = node.adjacent(edge);
      if (adjacent.owningContainer() !== node.owningContainer()) continue;
      if (adjacent.edges.length === 1) spokes.push(adjacent);
      else hasConnected = true;
    }
    if (hasConnected && spokes.length > 0) graph.hubs.set(node, spokes);
  }
}
