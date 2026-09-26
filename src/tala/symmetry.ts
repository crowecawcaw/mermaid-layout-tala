import { TalaGraph, TalaNode } from './graph.js';
import { distanceBetweenBoxes } from './placement-geometry.js';
import { segmentIntersectsBox } from './sized-cost.js';

/** Ordinary-node branch of placementcost.NodeSymmetry. */
export function nodeSymmetry(node: TalaNode, graph: TalaGraph): number {
  return scoreNode(node, graph, true);
}

function scoreNode(node: TalaNode, graph: TalaGraph, checkNeighbors: boolean): number {
  if (!node.topLeft) return 0;
  const neighbors = [...new Set(node.edges.map((edge) => node.adjacent(edge)))]
    .filter((other) => other.topLeft && distanceBetweenBoxes(
      { topLeft: node.topLeft!, width: node.width, height: node.height },
      { topLeft: other.topLeft!, width: other.width, height: other.height },
    ) <= 1200);
  if (neighbors.length === 0) return 0;
  const matched = new Set<number>();
  let score = 0;
  for (let i = 0; i < neighbors.length; i++) {
    if (matched.has(i)) continue;
    const first = neighbors[i]!;
    let bestIndex = -1, best = 0;
    for (let j = i + 1; j < neighbors.length; j++) {
      if (matched.has(j)) continue;
      const second = neighbors[j]!;
      if (first.parent !== second.parent) continue;
      const firstArea = first.width * first.height, secondArea = second.width * second.height;
      if (firstArea > 2 * secondArea || secondArea > 2 * firstArea) continue;
      let matchScore = 0;
      for (const xAxis of [true, false]) {
        const axis = xAxis ? node.topLeft.x + node.width / 2 : node.topLeft.y + node.height / 2;
        if (!mirrored(first, second, xAxis, axis, graph.cellSize)) continue;
        matchScore = overlapsAlongDimension(node, first, xAxis)
          && overlapsAlongDimension(node, second, xAxis) ? 2 : 0.5;
        break;
      }
      if (matchScore === 0 || obstructed(node, first, second, graph)) continue;
      if (matchScore > best) {
        best = matchScore; bestIndex = j;
        if (best === 2) break;
      }
    }
    if (bestIndex >= 0) {
      matched.add(i); matched.add(bestIndex);
      score += best;
    }
  }
  if (checkNeighbors) {
    neighbors.forEach((neighbor, index) => {
      if (!matched.has(index)) score += scoreNode(neighbor, graph, false);
    });
  }
  return score / neighbors.length;
}

function mirrored(first: TalaNode, second: TalaNode, xAxis: boolean, axis: number, tolerance: number): boolean {
  const firstStart = xAxis ? first.topLeft!.x : first.topLeft!.y;
  const secondStart = xAxis ? second.topLeft!.x : second.topLeft!.y;
  if (firstStart === secondStart) return false;
  const firstEnd = firstStart + (xAxis ? first.width : first.height);
  const secondEnd = secondStart + (xAxis ? second.width : second.height);
  const leftStart = firstStart < secondStart ? firstStart : secondStart;
  const leftEnd = firstStart < secondStart ? firstEnd : secondEnd;
  const rightStart = firstStart < secondStart ? secondStart : firstStart;
  const rightEnd = firstStart < secondStart ? secondEnd : firstEnd;
  if (!(axis > leftEnd && axis < rightStart)) return false;
  if (Math.abs((rightStart - axis) - (axis - leftEnd)) > tolerance) return false;
  const firstCenter = xAxis ? first.topLeft!.y + first.height / 2 : first.topLeft!.x + first.width / 2;
  const secondCenter = xAxis ? second.topLeft!.y + second.height / 2 : second.topLeft!.x + second.width / 2;
  return Math.abs(firstCenter - secondCenter) <= tolerance;
}

function overlapsAlongDimension(center: TalaNode, other: TalaNode, horizontal: boolean): boolean {
  if (horizontal) return center.topLeft!.y <= other.topLeft!.y + other.height
    && center.topLeft!.y + center.height >= other.topLeft!.y;
  return center.topLeft!.x <= other.topLeft!.x + other.width
    && center.topLeft!.x + center.width >= other.topLeft!.x;
}

function obstructed(center: TalaNode, first: TalaNode, second: TalaNode, graph: TalaGraph): boolean {
  const start = { x: center.topLeft!.x + center.width / 2, y: center.topLeft!.y + center.height / 2 };
  const firstEnd = { x: first.topLeft!.x + first.width / 2, y: first.topLeft!.y + first.height / 2 };
  const secondEnd = { x: second.topLeft!.x + second.width / 2, y: second.topLeft!.y + second.height / 2 };
  const candidates = new Set([
    ...(graph.containers.get(center.parent) ?? []),
    ...(graph.containers.get(first.parent) ?? []),
  ]);
  for (const other of candidates) {
    if (other === center || other === first || other === second || !other.topLeft) continue;
    if (segmentIntersectsBox(start, firstEnd, other) || segmentIntersectsBox(start, secondEnd, other)) return true;
  }
  return false;
}
