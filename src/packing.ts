// Adapted from TALA packing.CombineSubgraphs at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { LayoutResult, Point, PositionedNode } from "./layout.js";

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const round = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v));
function bounds(graph: LayoutResult, rounded: boolean): Bounds {
  const box = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };
  const include = (x: number, y: number) => {
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
  };
  for (const node of graph.nodes) {
    include(node.x - node.width / 2, node.y - node.height / 2);
    include(
      rounded ? round(node.x + node.width / 2) : node.x + node.width / 2,
      rounded ? round(node.y + node.height / 2) : node.y + node.height / 2,
    );
  }
  for (const edge of graph.edges) {
    for (const point of edge.points) include(round(point.x), round(point.y));
    if (edge.labelWidth && edge.labelHeight) {
      include(
        round(edge.x - edge.labelWidth / 2),
        round(edge.y - edge.labelHeight / 2),
      );
      include(
        round(edge.x + edge.labelWidth / 2),
        round(edge.y + edge.labelHeight / 2),
      );
    }
  }
  if (!graph.nodes.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return rounded
    ? {
        left: round(box.left),
        top: round(box.top),
        right: round(box.right),
        bottom: round(box.bottom),
      }
    : box;
}
/** Combine independent positioned subgraphs using upstream's candidate points
 * and area-plus-square-deviation objective. Graphs are owned by the caller's
 * current layout attempt. Fixed nodes and ancestor obstacles are not exposed.
 */
export function combineComponents(components: LayoutResult[]): void {
  const area = (graph: LayoutResult) => {
    const b = bounds(graph, false);
    return (b.right - b.left) * (b.bottom - b.top);
  };
  const sorted = components
    .filter((graph) => graph.nodes.length)
    .slice()
    .sort((a, b) => area(b) - area(a));
  const placed: PositionedNode[] = [];
  const candidates: Point[] = [];
  let combinedRight = -Infinity,
    combinedBottom = -Infinity;
  let work = 0;
  for (const graph of sorted) {
    const box = bounds(graph, true);
    let best = { x: 0, y: 0 },
      bestIndex = 0,
      bestCost = Infinity;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]!;
      const dx = candidate.x - box.left,
        dy = candidate.y - box.top;
      let collides = false;
      for (const node of graph.nodes) {
        for (const other of placed) {
          if (++work > 50_000_000)
            throw new Error("component packing work limit exceeded");
          if (
            Math.abs(node.x + dx - other.x) <
              (node.width + other.width) / 2 + 20 &&
            Math.abs(node.y + dy - other.y) <
              (node.height + other.height) / 2 + 20
          ) {
            collides = true;
            break;
          }
        }
        if (collides) break;
      }
      if (collides) continue;
      const width = Math.max(combinedRight, candidate.x + box.right - box.left),
        height = Math.max(combinedBottom, candidate.y + box.bottom - box.top);
      const cost = width * height + (width - height) ** 2 * 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
        bestIndex = index;
      }
    }
    if (candidates.length) {
      candidates[bestIndex] = candidates.at(-1)!;
      candidates.pop();
    }
    const dx = best.x - box.left,
      dy = best.y - box.top;
    for (const node of graph.nodes) {
      node.x += dx;
      node.y += dy;
      if (node.labelX !== undefined) node.labelX += dx;
      if (node.labelY !== undefined) node.labelY += dy;
      placed.push(node);
    }
    for (const edge of graph.edges) {
      edge.x += dx;
      edge.y += dy;
      edge.points = edge.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    const left = box.left + dx,
      top = box.top + dy,
      right = box.right + dx,
      bottom = box.bottom + dy;
    combinedRight = Math.max(combinedRight, right);
    combinedBottom = Math.max(combinedBottom, bottom);
    candidates.push(
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
      { x: right + 20, y: top },
      { x: right + 20, y: bottom },
      { x: left, y: bottom + 20 },
    );
  }
}
