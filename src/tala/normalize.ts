import type { LayoutResult } from '../layout.js';

/** Non-fixed placement.Normalize branch for positioned nodes and routes. */
export function normalizeLayoutResult(result: LayoutResult): LayoutResult {
  if (result.nodes.length === 0 || result.nodes.some((node) => node.fixedTopLeft)) return result;
  let minX = Infinity, minY = Infinity;
  for (const node of result.nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
  }
  for (const edge of result.edges) {
    for (const point of edge.points) {
      minX = Math.min(minX, Math.floor(point.x));
      minY = Math.min(minY, Math.floor(point.y));
    }
    if (edge.labelBBox) {
      minX = Math.min(minX, Math.floor(edge.x - edge.labelBBox.width / 2));
      minY = Math.min(minY, Math.floor(edge.y - edge.labelBBox.height / 2));
    }
  }
  if (minX === 0 && minY === 0) return result;
  return {
    nodes: result.nodes.map((node) => ({ ...node, x: node.x - minX, y: node.y - minY })),
    edges: result.edges.map((edge) => ({ ...edge,
      points: edge.points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
      x: edge.x - minX, y: edge.y - minY })),
  };
}
