// Translated from internal/hierarchy/sifting.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { CountSegmentCrossings } from '../layoutgraph/segment-crossing.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { PlacementNode, computeLevelRanks } from './placement-nodes.js';
import { allDescendants, crossLevelSegments, addLengths } from './crossing.js';
export function nodesInDescendingDegreeOrder(
  byLevel: Map<number, PlacementNode[]>,
): PlacementNode[] {
  const nodes: PlacementNode[] = [];
  for (let level = 0; level < byLevel.size; level++)
    nodes.push(...allDescendants(byLevel.get(level) ?? [], true));
  nodes.sort(
    (a, b) => b.degree() - a.degree() || a.level - b.level || a.rank - b.rank,
  );
  return nodes;
}
export function buildNodeToSiblings(
  nodes: PlacementNode[],
  byLevel: Map<number, PlacementNode[]>,
): Map<PlacementNode, PlacementNode[]> {
  const map = new Map<PlacementNode, PlacementNode[]>();
  for (const node of nodes)
    map.set(
      node,
      node.container ? node.container.children : byLevel.get(node.level)!,
    );
  return map;
}
export function improved(
  crossings: number,
  best: number,
  length: number,
  bestLength: number,
  equal: boolean,
): boolean {
  if (!equal)
    return (
      crossings < best ||
      (crossings === best &&
        PrecisionCompare(length, bestLength, PRECISION) === -1)
    );
  return (
    crossings <= best ||
    (crossings === best && PrecisionCompare(length, bestLength, PRECISION) < 1)
  );
}
export function sifting(
  node: PlacementNode,
  siblings: PlacementNode[],
  byLevel: Map<number, PlacementNode[]>,
  equal: boolean,
): void {
  let segments = crossLevelSegments(siblings, true, true),
    best = CountSegmentCrossings(segments),
    bestLength = addLengths(segments),
    bestIndex = -1;
  if (best === 0 || siblings.length === 1) return;
  if (node === siblings[siblings.length - 1]) bestIndex = siblings.length - 1;
  else {
    for (let i = 0; i < siblings.length - 1; i++) {
      if (bestIndex === -1) {
        if (siblings[i] === node) bestIndex = i;
        else continue;
      }
      [siblings[i + 1], siblings[i]] = [siblings[i]!, siblings[i + 1]!];
      computeLevelRanks(byLevel.get(node.level)!);
      segments = crossLevelSegments(siblings, true, true);
      const crossings = CountSegmentCrossings(segments),
        length = addLengths(segments);
      if (improved(crossings, best, length, bestLength, equal)) {
        best = crossings;
        bestIndex = i + 1;
        bestLength = length;
      }
    }
    if (siblings[siblings.length - 1] !== node)
      throw new Error(
        `sifting: expected node ${nodeDebugID(node.graphNode)} to have moved to the right of siblings slice`,
      );
    if (bestIndex === -1)
      throw new Error(`sifting: node ${nodeDebugID(node.graphNode)} not found`);
  }
  for (let i = siblings.length - 1; i > 0; i--) {
    [siblings[i - 1], siblings[i]] = [siblings[i]!, siblings[i - 1]!];
    computeLevelRanks(byLevel.get(node.level)!);
    segments = crossLevelSegments(siblings, true, true);
    const crossings = CountSegmentCrossings(segments),
      length = addLengths(segments);
    if (improved(crossings, best, length, bestLength, equal)) {
      best = crossings;
      bestIndex = i - 1;
      bestLength = length;
    }
  }
  if (siblings[0] !== node)
    throw new Error(
      `sifting: expected node ${nodeDebugID(node.graphNode)} to have moved to the left of siblings slice`,
    );
  for (let i = 0; i < siblings.length; i++) {
    if (i === bestIndex) break;
    [siblings[i + 1], siblings[i]] = [siblings[i]!, siblings[i + 1]!];
  }
  computeLevelRanks(byLevel.get(node.level)!);
}
export function globalSifting(byLevel: Map<number, PlacementNode[]>): void {
  const queue = nodesInDescendingDegreeOrder(byLevel),
    siblings = buildNodeToSiblings(queue, byLevel);
  let equal = false;
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const node of [...queue]) {
      const old = node.rank;
      sifting(node, siblings.get(node)!, byLevel, equal);
      if (node.rank !== old) changed = true;
    }
    if (!changed) {
      if (equal) break;
      equal = true;
    } else equal = false;
  }
}
