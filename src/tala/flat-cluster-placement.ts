import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode } from '../layout.js';
import { TalaGraph } from './graph.js';
import { placeOrdinaryNodes } from './ordinary-placement.js';
import { discoverFlatClusters } from './flat-clusters.js';

/** The flat ordinary placement path after sibling clusters become vessels. */
export function placeFlatClusters(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, seed: number, ranks: ReadonlyMap<string, number>): PositionedNode[] | undefined {
  const discovery = discoverFlatClusters(nodes, edges, seed);
  if (discovery.clusters.length === 0) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const usedIds = new Set(byId.keys());
  const vesselIds = discovery.clusters.map((_, index) => {
    let id = `__tala_cluster_${index}`;
    while (usedIds.has(id)) id += '_';
    usedIds.add(id);
    return id;
  });
  const vesselFor = new Map<string, string>();
  discovery.clusters.forEach((cluster, index) => {
    for (const member of cluster.nodes) vesselFor.set(member, vesselIds[index]!);
  });
  const graphNodes: LayoutNode[] = [
    ...nodes.filter((node) => !vesselFor.has(node.id)),
    ...discovery.clusters.map((cluster, index) => ({
      id: vesselIds[index]!, width: cluster.width, height: cluster.height,
    })),
  ];
  const graphEdges = edges.map((edge) => ({ ...edge,
    from: vesselFor.get(edge.from) ?? edge.from,
    to: vesselFor.get(edge.to) ?? edge.to,
  }));
  if (graphEdges.some((edge) => edge.from === edge.to)) return;
  // The vessel's long axis is the branch axis. Place its neighbors across
  // the short axis so a parallel fan does not become an extremely tall chain.
  const arrangement = discovery.clusters.length === 1 ? discovery.clusters[0]!.arrangement : undefined;
  const placementDirection: LayoutDirection = arrangement === 'Column'
    ? direction === 'RL' ? 'RL' : 'LR'
    : arrangement === 'Row' ? direction === 'BT' ? 'BT' : 'TB' : direction;
  const graph = TalaGraph.fromFlowchart(graphNodes, graphEdges, placementDirection);
  placeOrdinaryNodes(graph, seed);
  const positions = new Map(graph.nodes.map((node) => [node.id, node.topLeft!]));
  const horizontal = placementDirection === 'LR' || placementDirection === 'RL';
  const placed = new Map<string, PositionedNode>();
  for (const node of nodes) {
    if (vesselFor.has(node.id)) continue;
    const point = positions.get(node.id)!;
    placed.set(node.id, { ...node, x: point.x + node.width / 2,
      y: point.y + node.height / 2, rank: ranks.get(node.id) ?? 0, order: 0 });
  }
  for (const [index, cluster] of discovery.clusters.entries()) {
    const vessel = vesselIds[index]!;
    const point = positions.get(vessel)!;
    // Cluster vessels retain the same cross-axis center as their neighbors.
    const adjacent = graphEdges.filter((edge) => edge.from === vessel || edge.to === vessel)
      .map((edge) => edge.from === vessel ? edge.to : edge.from)
      .filter((id) => id !== vessel);
    const centers = adjacent.map((id) => {
      const adjacentPoint = positions.get(id)!;
      const adjacentNode = graphNodes.find((node) => node.id === id)!;
      return horizontal ? adjacentPoint.y + adjacentNode.height / 2
        : adjacentPoint.x + adjacentNode.width / 2;
    });
    const crossCenter = centers.length > 0
      ? centers.reduce((sum, center) => sum + center, 0) / centers.length
      : horizontal ? point.y + cluster.height / 2 : point.x + cluster.width / 2;
    const vesselX = horizontal ? point.x : Math.round(crossCenter - cluster.width / 2);
    const vesselY = horizontal ? Math.round(crossCenter - cluster.height / 2) : point.y;
    const maxWidth = Math.max(...cluster.nodes.map((id) => byId.get(id)!.width));
    const maxHeight = Math.max(...cluster.nodes.map((id) => byId.get(id)!.height));
    for (const [memberIndex, id] of cluster.nodes.entries()) {
      const source = byId.get(id)!;
      const width = cluster.arrangement === 'Row' || cluster.arrangement === 'Column' ? maxWidth : source.width;
      const height = cluster.arrangement === 'Row' || cluster.arrangement === 'Column' ? maxHeight : source.height;
      const x = cluster.arrangement === 'Row'
        ? vesselX + memberIndex * (width + cluster.padding) : vesselX + (cluster.width - width) / 2;
      const y = cluster.arrangement === 'Column'
        ? vesselY + memberIndex * (height + cluster.padding) : vesselY + (cluster.height - height) / 2;
      placed.set(id, { ...source, width, height, x: x + width / 2, y: y + height / 2,
        rank: ranks.get(id) ?? 0, order: memberIndex });
    }
  }
  const byRank = new Map<number, PositionedNode[]>();
  for (const node of placed.values()) {
    const row = byRank.get(node.rank) ?? [];
    row.push(node);
    byRank.set(node.rank, row);
  }
  for (const row of byRank.values()) {
    row.sort((a, b) => horizontal ? a.y - b.y : a.x - b.x);
    row.forEach((node, index) => { node.order = index; });
  }
  return nodes.map((node) => placed.get(node.id)!);
}
