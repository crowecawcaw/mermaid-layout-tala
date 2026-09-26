import { TalaGraph, TalaNode } from './graph.js';

/** Ordinary-edge branch of Graph.SplitSubgraphs. Each view owns an ordered
 * subset of the parent graph's entity references, as upstream does while the
 * placement pipeline is operating on one component. */
export function splitOrdinarySubgraphs(graph: TalaGraph): TalaGraph[] {
  if (graph.nodes.some((node) => node.parent)) throw new Error('container subgraph splitting is not ported');
  const added = new Set<TalaNode>();
  const components: TalaGraph[] = [];
  for (const start of graph.nodes) {
    if (added.has(start)) continue;
    const component = new TalaGraph();
    const queue = [start];
    added.add(start);
    for (let index = 0; index < queue.length; index++) {
      const node = queue[index]!;
      component.nodes.push(node);
      for (const edge of node.edges) {
        const neighbor = node.adjacent(edge);
        if (!added.has(neighbor)) {
          added.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    component.directions.set(null, graph.directions.get(null) ?? 'TB');
    component.containers.set(null, component.nodes);
    components.push(component);
  }
  const belonging = new Map<TalaNode, TalaGraph>();
  for (const component of components) for (const node of component.nodes) belonging.set(node, component);
  for (const edge of graph.edges) {
    const component = belonging.get(edge.from);
    if (component && component === belonging.get(edge.to)) component.edges.push(edge);
  }
  for (const component of components) component.computeCellSize();
  return components;
}
