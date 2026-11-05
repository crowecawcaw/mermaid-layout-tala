// Translated from internal/hierarchy/crossing.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { PrecisionCompare, EuclideanDistance } from '../geo/math.js';
import {
  CountSegmentCrossings,
  type CrossingSegment,
} from '../layoutgraph/segment-crossing.js';
import { PlacementNode, computeLevelRanks } from './placement-nodes.js';
export function iterAllDescendants(
  nodes: PlacementNode[],
  f: (node: PlacementNode) => void,
): void {
  for (const n of nodes) f(n);
  for (const n of nodes) iterAllDescendants(n.children, f);
}
export function allDescendants(
  nodes: PlacementNode[],
  optimization: boolean,
): PlacementNode[] {
  const result = [...nodes];
  for (const n of nodes)
    if (!optimization || n.optimizeChildrenCrossings)
      result.push(...allDescendants(n.children, optimization));
  return result;
}
export function crossLevelSegments(
  nodes: PlacementNode[],
  aboves: boolean,
  belows: boolean,
): CrossingSegment[] {
  const segments: CrossingSegment[] = [];
  iterAllDescendants(nodes, (pn) => {
    if (aboves)
      for (const n of pn.aboves)
        segments.push({
          Start: new Point(pn.rank, pn.level),
          End: new Point(n.rank, n.level),
        });
    if (belows)
      for (const n of pn.belows)
        segments.push({
          Start: new Point(pn.rank, pn.level),
          End: new Point(n.rank, n.level),
        });
  });
  segments.sort((a, b) => a.Start.X - b.Start.X || a.End.X - b.End.X);
  return segments;
}
export function addLengths(segments: CrossingSegment[]): number {
  let length = 0;
  for (const s of segments)
    length += EuclideanDistance(s.Start.X, s.Start.Y, s.End.X, s.End.Y);
  return length;
}
export function sortLevelNodesByAdjacencyPosition(
  nodes: PlacementNode[],
  above: boolean,
): void {
  const average = (pn: PlacementNode) => {
    const neighbors = above ? pn.aboves : pn.belows;
    if (!neighbors.size) return 0;
    let sum = 0;
    for (const n of neighbors) sum += n.rank;
    return sum / neighbors.size;
  };
  nodes.sort((a, b) => average(a) - average(b));
}
export function bestIndexBySwappingNeighbors(
  nodes: PlacementNode[],
  nodeIndex: number,
  byLevel: Map<number, PlacementNode[]>,
): [number, number, number] {
  let best = Number.MAX_SAFE_INTEGER,
    bestLength = Infinity,
    bestIndex = 0;
  for (let i = nodeIndex + 1; i < nodeIndex + 4; i++) {
    const j = i % nodes.length;
    [nodes[nodeIndex], nodes[j]] = [nodes[j]!, nodes[nodeIndex]!];
    computeLevelRanks(byLevel.get(nodes[nodeIndex]!.level)!);
    const segments = crossLevelSegments(nodes, true, true),
      crossings = CountSegmentCrossings(segments),
      length = addLengths(segments);
    if (
      crossings < best ||
      (crossings === best &&
        PrecisionCompare(length, bestLength, 0.0001) === -1)
    ) {
      best = crossings;
      bestLength = length;
      bestIndex = j;
    }
    [nodes[j], nodes[nodeIndex]] = [nodes[nodeIndex]!, nodes[j]!];
  }
  return [best, bestLength, bestIndex];
}
export function minimizeCrossings(
  nodes: PlacementNode[],
  byLevel: Map<number, PlacementNode[]>,
  topDown: boolean,
): void {
  sortLevelNodesByAdjacencyPosition(nodes, topDown);
  computeLevelRanks(byLevel.get(nodes[0]!.level)!);
  let segments = crossLevelSegments(nodes, true, true),
    crossings = CountSegmentCrossings(segments),
    length = addLengths(segments);
  for (let j = 0; j < nodes.length; j++) {
    const [next, nextLength, index] = bestIndexBySwappingNeighbors(
      nodes,
      j,
      byLevel,
    );
    if (
      next < crossings ||
      (next === crossings &&
        PrecisionCompare(nextLength, length, 0.0001) === -1)
    ) {
      crossings = next;
      length = nextLength;
      [nodes[j], nodes[index]] = [nodes[index]!, nodes[j]!];
    }
    computeLevelRanks(byLevel.get(nodes[0]!.level)!);
  }
  for (const node of nodes)
    if (node.children.length && node.optimizeChildrenCrossings)
      minimizeCrossings(node.children, byLevel, topDown);
}
export function minimizeHierarchyCrossings(
  byLevel: Map<number, PlacementNode[]>,
): void {
  let widest = 0;
  for (const nodes of byLevel.values()) widest = Math.max(widest, nodes.length);
  for (let i = 0; i < widest; i++)
    for (let level = 0; level < byLevel.size; level++)
      minimizeCrossings(byLevel.get(level)!, byLevel, level > 0);
}
