import type { TalaEdge, TalaGraph, TalaNode } from './graph.js';
import { segmentIntersectsBox } from './sized-cost.js';
import { wrapContainers } from './equidistance.js';
import { doesOverlapAt } from './overlap.js';

const MaxGraphSize = 30_000;

/** The geometry validity part of upstream placement.attemptShift. The caller
 * chooses the connected set and compares placement costs before keeping it. */
export function attemptAxisShift(graph: TalaGraph, edge: TalaEdge,
  nodes: readonly TalaNode[], dx: number, dy: number,
  existingOverlaps = overlapPairs(graph)): boolean {
  const originals = graph.nodes.map((node) => ({ node, topLeft: node.topLeft
    ? { ...node.topLeft } : undefined, width: node.width, height: node.height,
    x: node.x, y: node.y }));
  for (const node of nodes) {
    if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
    node.topLeft = { x: node.topLeft.x + dx, y: node.topLeft.y + dy };
    if (node.x !== undefined) node.x += dx;
    if (node.y !== undefined) node.y += dy;
  }
  if (graph.nodes.some((node) => node.isGroup && node.children.length)) wrapContainers(graph);
  const valid = withinMaxSize(graph) && !intersectsOtherNode(graph, edge.from, edge.to)
    && !introducesOverlap(graph, existingOverlaps) && preservesFixedOrigins(originals)
    && preservesFixedBoundary(graph);
  if (!valid) for (const { node, topLeft, width, height, x, y } of originals) {
    node.topLeft = topLeft;
    node.width = width;
    node.height = height;
    node.x = x;
    node.y = y;
  }
  return valid;
}

/** Existing overlap exceptions are captured when upstream creates the stage
 * transaction. Later candidates may retain those pairs, but not add new ones. */
export interface OverlapPairs {
  padded: ReadonlySet<string>;
  exact: ReadonlySet<string>;
}

export function overlapPairs(graph: TalaGraph): OverlapPairs {
  const padded = new Set<string>(), exact = new Set<string>();
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const first = graph.nodes[i]!, second = graph.nodes[j]!;
      const key = `${i}:${j}`;
      if (overlaps(first, second)) padded.add(key);
      if (exactOverlap(first, second)) exact.add(key);
    }
  }
  return { padded, exact };
}

function introducesOverlap(graph: TalaGraph, existing: OverlapPairs): boolean {
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const first = graph.nodes[i]!, second = graph.nodes[j]!;
      const key = `${i}:${j}`;
      if (!existing.padded.has(key) && overlaps(first, second)) return true;
      if (existing.padded.has(key) && !existing.exact.has(key)
        && exactOverlap(first, second)) return true;
    }
  }
  return false;
}

function exactOverlap(first: TalaNode, second: TalaNode): boolean {
  if (!first.topLeft || !second.topLeft) return false;
  return first.topLeft.x < second.topLeft.x + second.width
    && first.topLeft.x + first.width > second.topLeft.x
    && first.topLeft.y < second.topLeft.y + second.height
    && first.topLeft.y + first.height > second.topLeft.y;
}

function overlaps(first: TalaNode, second: TalaNode): boolean {
  if (!first.topLeft || !second.topLeft || first.isDescendantOf(second)
    || second.isDescendantOf(first)) return false;
  return doesOverlapAt(first, second, first.topLeft)
    || doesOverlapAt(second, first, second.topLeft);
}

function preservesFixedOrigins(originals: readonly { node: TalaNode; topLeft: { x: number; y: number } | undefined }[]): boolean {
  return originals.every(({ node, topLeft }) => !node.fixedTopLeft
    || node.topLeft?.x === topLeft?.x && node.topLeft?.y === topLeft?.y);
}

/** Upstream's first fixed node in each container defines the minimum origin
 * for all other direct children in that container. */
function preservesFixedBoundary(graph: TalaGraph): boolean {
  const origins = new Map<TalaNode | null, { x: number; y: number }>();
  for (const node of graph.nodes) {
    if (!node.fixedTopLeft || !node.topLeft || origins.has(node.parent)) continue;
    origins.set(node.parent, { x: node.topLeft.x - node.fixedTopLeft.x,
      y: node.topLeft.y - node.fixedTopLeft.y });
  }
  for (const node of graph.nodes) {
    const origin = origins.get(node.parent);
    if (origin && node.topLeft && (node.topLeft.x < origin.x
      || node.topLeft.y < origin.y)) return false;
  }
  return true;
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
