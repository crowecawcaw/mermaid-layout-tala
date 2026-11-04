import type { Point, PositionedEdge, PositionedNode } from './layout.js';
import { routeMidpoint } from './routing.js';

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4
  && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 4;

/** Greedy deterministic label placement. Prefer points on the route, then
 * nearby free positions. Reserve earlier labels and container title bands.
 * This does not reproduce upstream's node/icon/arrowhead label optimizer.
 */
export function placeEdgeLabels(nodes: readonly PositionedNode[], edges: PositionedEdge[]): void {
  const occupied: Rect[] = nodes.map((node) => node.isGroup ? {
    x: node.x, y: node.y - node.height / 2 + (node.labelHeight ?? 24) / 2,
    width: node.width, height: node.labelHeight ?? 24,
  } : node);
  for (const edge of edges) {
    const width = edge.labelWidth ?? 0;
    const height = edge.labelHeight ?? 0;
    if (width === 0 || height === 0) continue;
    const center = routeMidpoint(edge.points);
    const candidates: Point[] = [center];
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1]!, b = edge.points[i]!;
      candidates.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    const free = (p: Point) => !occupied.some((box) => overlaps({ ...p, width, height }, box));
    let chosen = candidates.find(free);
    if (!chosen) {
      // Moving beyond the complete occupied bounds guarantees termination,
      // including crowded parallel labels and zero-spacing layouts.
      const right = Math.max(center.x, ...occupied.map((box) => box.x + box.width / 2));
      const bottom = Math.max(center.y, ...occupied.map((box) => box.y + box.height / 2));
      for (let radius = 1; radius <= 16 && !chosen; radius++) {
        const dx = radius * (width + 8), dy = radius * (height + 8);
        chosen = [
          { x: center.x, y: center.y - dy }, { x: center.x + dx, y: center.y },
          { x: center.x, y: center.y + dy }, { x: center.x - dx, y: center.y },
        ].find(free);
      }
      chosen ??= { x: right + width / 2 + 8, y: bottom + height / 2 + 8 };
    }
    edge.x = chosen.x;
    edge.y = chosen.y;
    occupied.push({ ...chosen, width, height });
  }
}
