import type { TalaEdge, TalaGraph, TalaNode } from './graph.js';
import { segmentIntersectsBox } from './sized-cost.js';

const MaxGraphSize = 30_000;

/** The geometry validity part of upstream placement.attemptShift. The caller
 * chooses the connected set and compares placement costs before keeping it. */
export function attemptAxisShift(graph: TalaGraph, edge: TalaEdge,
  nodes: readonly TalaNode[], dx: number, dy: number): boolean {
  const originals = nodes.map((node) => ({ node, topLeft: node.topLeft
    ? { ...node.topLeft } : undefined, x: node.x, y: node.y }));
  for (const { node } of originals) {
    if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
    node.topLeft = { x: node.topLeft.x + dx, y: node.topLeft.y + dy };
    if (node.x !== undefined) node.x += dx;
    if (node.y !== undefined) node.y += dy;
  }
  const valid = withinMaxSize(graph) && !intersectsOtherNode(graph, edge.from, edge.to);
  if (!valid) for (const { node, topLeft, x, y } of originals) {
    node.topLeft = topLeft;
    node.x = x;
    node.y = y;
  }
  return valid;
}

function withinMaxSize(graph: TalaGraph): boolean {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of graph.nodes) {
    if (!node.topLeft) continue;
    minX = Math.min(minX, node.topLeft.x);
    minY = Math.min(minY, node.topLeft.y);
    maxX = Math.max(maxX, node.topLeft.x + node.width);
    maxY = Math.max(maxY, node.topLeft.y + node.height);
  }
  for (const edge of graph.edges) for (const point of edge.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return maxX - minX <= MaxGraphSize && maxY - minY <= MaxGraphSize;
}

function intersectsOtherNode(graph: TalaGraph, first: TalaNode, second: TalaNode): boolean {
  if (!first.topLeft || !second.topLeft) return false;
  const firstCenter = { x: first.topLeft.x + first.width / 2,
    y: first.topLeft.y + first.height / 2 };
  const secondCenter = { x: second.topLeft.x + second.width / 2,
    y: second.topLeft.y + second.height / 2 };
  for (const other of graph.nodes) {
    if (other === first || other === second || !other.topLeft) continue;
    if (first.isDescendantOf(other) || second.isDescendantOf(other)
      || other.isDescendantOf(first) || other.isDescendantOf(second)) continue;
    if (segmentIntersectsBox(firstCenter, secondCenter, other)) return true;
  }
  return false;
}
