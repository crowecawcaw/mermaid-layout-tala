// Adapted from TALA placement.Normalize, D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { LayoutResult } from './layout.js';

/** Move the completed graph, routes and label geometry to a nonnegative origin. */
export function normalizeLayout(result: LayoutResult): void {
  if (result.nodes.length === 0) return;
  let minX = Infinity,
    minY = Infinity;
  for (const node of result.nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
  }
  for (const edge of result.edges) {
    for (const point of edge.points) {
      minX = Math.min(minX, Math.floor(point.x));
      minY = Math.min(minY, Math.floor(point.y));
    }
    if (edge.labelWidth && edge.labelHeight) {
      minX = Math.min(minX, Math.floor(edge.x - edge.labelWidth / 2));
      minY = Math.min(minY, Math.floor(edge.y - edge.labelHeight / 2));
    }
  }
  for (const node of result.nodes) {
    node.x -= minX;
    node.y -= minY;
    if (node.labelX !== undefined) node.labelX -= minX;
    if (node.labelY !== undefined) node.labelY -= minY;
  }
  for (const edge of result.edges) {
    edge.x -= minX;
    edge.y -= minY;
    // Routes may share point objects at their endpoints or bends. A new point
    // array prevents translating an aliased coordinate more than once.
    edge.points = edge.points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
  }
}
