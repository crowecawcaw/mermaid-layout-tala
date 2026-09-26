import type { LayoutEdge, LayoutNode } from '../layout.js';

// placement.Prescale and scaleBasedOnEdges in upstream TALA. A side needs
// enough length for every port that may be assigned to it during routing.
const sideEdgeSpacing = 40;

export function prescaleNodes(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutNode[] {
  const incident = new Map(nodes.map((node) => [node.id, new Map<string, number>()]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const from = incident.get(edge.from);
    const to = incident.get(edge.to);
    if (!from || !to) continue;
    from.set(edge.to, (from.get(edge.to) ?? 0) + 1);
    to.set(edge.from, (to.get(edge.from) ?? 0) + 1);
  }
  return nodes.map((node) => {
    let width = node.width, height = node.height;
    if (node.aspectRatio1) width = height = Math.max(width, height);
    if (node.desiredWidth !== undefined || node.desiredHeight !== undefined) {
      return { ...node, width, height };
    }
    const counts = incident.get(node.id)!;
    if (counts.size === 0) return { ...node, width, height };
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const maxAdjacent = Math.max(...counts.values());
    const sides = Math.min(counts.size, 4);
    const edgesPerSide = Math.max(maxAdjacent, Math.ceil(total / sides));
    if (edgesPerSide === 1) return { ...node, width, height };
    const minimum = (edgesPerSide + 1) * sideEdgeSpacing;
    if (minimum < Math.min(width, height)) return { ...node, width, height };
    if (node.aspectRatio1) width = height = Math.max(width, minimum);
    else {
      width = Math.max(width, minimum);
      height = Math.max(height, minimum);
    }
    return { ...node, width, height };
  });
}
