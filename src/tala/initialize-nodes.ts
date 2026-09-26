import { TalaGraph, TalaNode } from './graph.js';
import { sizelessNodeEdgeLength } from './sizeless-cost.js';
import { closestUnoccupiedDistance, medianToNeighbors } from './sizeless-optimizer.js';

/** Non-fixed, connected ordinary-graph branch of placement.initializeNodes.
 * Upstream invokes this for odd seeds and when graph-distance initialization
 * cannot handle a component. */
export function initializeNodes(graph: TalaGraph): void {
  if (graph.nodes.length === 0) return;
  if (graph.nodes.some((node) => node.isGroup)) throw new Error('compound initialization is not ported');
  const fixed = graph.nodes.filter((node) => node.fixedTopLeft);
  const order: TalaNode[] = [];
  const visited = new Set<TalaNode>();
  for (const start of fixed.length > 0 ? fixed : [graph.nodes[0]!]) {
    for (const node of reachableBreadthFirst(start)) {
      if (!visited.has(node)) {
        visited.add(node);
        order.push(node);
      }
    }
  }
  if (order.length !== graph.nodes.length) throw new Error('initializeNodes needs one connected component or a fixed-node subgraph');
  for (const node of graph.nodes) node.topLeft = undefined;
  if (fixed.length === 0) order[0]!.topLeft = { x: graph.nodes.length, y: graph.nodes.length };
  else for (const node of fixed) {
    node.topLeft = {
      x: Math.ceil(node.fixedTopLeft!.x / (graph.cellSize * 3)),
      y: Math.ceil(node.fixedTopLeft!.y / (graph.cellSize * 3)),
    };
  }
  const occupied = new Set<string>(graph.nodes.filter((node) => node.topLeft)
    .map((node) => `${node.topLeft!.x},${node.topLeft!.y}`));
  for (const node of order) {
    if (node.topLeft) continue;
    const median = medianToNeighbors(node);
    const x = Math.floor(median.x), y = Math.floor(median.y);
    const distance = closestUnoccupiedDistance({ x, y }, occupied);
    const minX = fixed.length ? Math.max(x - distance - 2, 0) : x - distance - 2;
    const maxX = x + distance + 2;
    const minY = fixed.length ? Math.max(y - distance - 2, 0) : y - distance - 2;
    const maxY = y + distance + 2;
    const target = node.edges.reduce((balance, edge) => edge.directed
      ? balance + (edge.to === node ? 1 : -1) : balance, 0) > 0;
    let bestCost = Infinity;
    let best: { x: number; y: number } | undefined;
    for (let px = target ? maxX : minX; target ? px >= minX : px <= maxX; px += target ? -1 : 1) {
      for (let py = target ? maxY : minY; target ? py >= minY : py <= maxY; py += target ? -1 : 1) {
        if (occupied.has(`${px},${py}`)) continue;
        node.topLeft = { x: px, y: py };
        const cost = sizelessNodeEdgeLength(node, graph);
        if (cost < bestCost) {
          bestCost = cost;
          best = node.topLeft;
        }
      }
    }
    if (!best) throw new Error(`could not initialize node ${node.id}`);
    node.topLeft = best;
    occupied.add(`${best.x},${best.y}`);
  }
}

function reachableBreadthFirst(start: TalaNode): TalaNode[] {
  const visited = new Set<TalaNode>([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    for (const edge of node.edges) {
      const adjacent = node.adjacent(edge);
      if (!visited.has(adjacent)) {
        visited.add(adjacent);
        queue.push(adjacent);
      }
    }
  }
  return queue;
}
