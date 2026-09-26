import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode } from '../layout.js';
import { TalaGraph } from './graph.js';
import { placeOrdinaryNodes } from './ordinary-placement.js';
import { activateSequences, identifySequences } from './sequence-topology.js';

/** Place flat Step runs through the same temporary vessels as upstream TALA. */
export function placeFlatSequences(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, seed: number,
  ranks: ReadonlyMap<string, number>): PositionedNode[] | undefined {
  if (!nodes.some((node) => node.shape?.toLowerCase() === 'step')) return;
  const graph = TalaGraph.fromFlowchart(nodes.map((node) => ({ ...node, parentId: undefined })),
    edges, direction);
  if (identifySequences(graph, null).length === 0) return;
  const active = activateSequences(graph);
  const activeIds = new Set(graph.nodes.map((node) => node.id));
  const projectedEdges = graph.toLayoutEdges().filter((edge) =>
    activeIds.has(edge.from) && activeIds.has(edge.to));
  const placement = TalaGraph.fromFlowchart(graph.toLayoutNodes(), projectedEdges, direction);
  if (placement.nodes.length > 1) placeOrdinaryNodes(placement, seed);
  else if (placement.nodes.length === 1) placement.nodes[0]!.topLeft = { x: 0, y: 0 };
  const positions = new Map(placement.nodes.map((node) => [node.id, node.topLeft!]));
  for (const sequence of active.sequences) {
    sequence.vessel.topLeft = { ...positions.get(sequence.vessel.id)! };
    sequence.syncGeometry();
  }
  const original = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, PositionedNode>();
  for (const node of graph.nodes) {
    if (!original.has(node.id)) continue;
    const point = positions.get(node.id)!;
    result.set(node.id, { ...original.get(node.id)!, width: node.width, height: node.height,
      x: point.x + node.width / 2, y: point.y + node.height / 2,
      rank: ranks.get(node.id) ?? 0, order: 0 });
  }
  for (const sequence of active.sequences) {
    for (const [index, node] of sequence.nodes.entries()) {
      result.set(node.id, { ...original.get(node.id)!, width: node.width, height: node.height,
        x: node.x!, y: node.y!, rank: ranks.get(node.id) ?? 0, order: index });
    }
  }
  active.restore();
  const horizontal = direction === 'LR' || direction === 'RL';
  const byRank = new Map<number, PositionedNode[]>();
  for (const node of result.values()) {
    const row = byRank.get(node.rank) ?? [];
    row.push(node);
    byRank.set(node.rank, row);
  }
  for (const row of byRank.values()) {
    row.sort((a, b) => horizontal ? a.y - b.y : a.x - b.x);
    row.forEach((node, index) => { node.order = index; });
  }
  return nodes.map((node) => result.get(node.id)!);
}
