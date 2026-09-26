import type { LayoutEdge, LayoutNode } from '../layout.js';

// placement.Prescale and scaleBasedOnEdges in upstream TALA. A side needs
// enough length for every port that may be assigned to it during routing.
const sideEdgeSpacing = 40;
const talaFontSizes = [13, 14, 16, 20, 24, 28, 32];

function isAspectRatio1(node: LayoutNode): boolean {
  const shape = node.shape?.toLowerCase().replaceAll(/[_\s-]/g, '');
  return node.aspectRatio1 === true || shape === 'circle' || shape === 'realsquare';
}

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
    const aspectRatio1 = isAspectRatio1(node);
    if (aspectRatio1) width = height = Math.max(width, height);
    const shape = node.shape?.toLowerCase();
    if (node.fixedTopLeft || node.desiredWidth !== undefined || node.desiredHeight !== undefined
      || shape === 'table' || shape === 'class') {
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
    let xRatio = 1, yRatio = 1;
    if (aspectRatio1) {
      if (width < minimum) {
        xRatio = minimum / width;
        yRatio = minimum / height;
        width = height = minimum;
      }
    } else {
      if (width < minimum) {
        xRatio = minimum / width;
        width = minimum;
      }
      if (height < minimum) {
        yRatio = minimum / height;
        height = minimum;
      }
    }
    if (node.fontSize === undefined) return { ...node, width, height };
    const minRatio = Math.min(xRatio, yRatio);
    let bestRatio = 1, fontSize = node.fontSize, closestDistance = Infinity;
    for (const size of talaFontSizes) {
      const ratio = size / node.fontSize;
      const distance = Math.abs(ratio - minRatio);
      if (distance < closestDistance) {
        fontSize = size;
        closestDistance = distance;
        bestRatio = ratio;
      }
    }
    if (bestRatio > minRatio) {
      const adjustedMinimum = Math.ceil(minimum * bestRatio / minRatio);
      width = Math.max(width, adjustedMinimum);
      height = Math.max(height, adjustedMinimum);
    }
    const labelBBox = node.labelBBox
      ? { width: Math.ceil(node.labelBBox.width * bestRatio),
        height: Math.ceil(node.labelBBox.height * bestRatio) }
      : undefined;
    return { ...node, width, height, fontSize, ...(labelBBox ? { labelBBox } : {}) };
  });
}
