import type { PositionedNode } from '../layout.js';
import { NodeGap } from './geometry-policy.js';

interface Box { minX: number; minY: number; width: number; height: number }
interface Point { x: number; y: number }

function bounds(nodes: readonly PositionedNode[]): Box {
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function overlapsWithGap(a: PositionedNode, dx: number, dy: number,
  b: PositionedNode): boolean {
  const left = a.x - a.width / 2 + dx;
  const top = a.y - a.height / 2 + dy;
  const otherLeft = b.x - b.width / 2;
  const otherTop = b.y - b.height / 2;
  return left < otherLeft + b.width + NodeGap
    && otherLeft < left + a.width + NodeGap
    && top < otherTop + b.height + NodeGap
    && otherTop < top + a.height + NodeGap;
}

/** The no-fixed-node branch of packing.CombineSubgraphs: largest bounding
 * boxes first, six candidate corners per packed subgraph, then area plus
 * square-deviation scoring. Mutates the supplied positioned nodes. */
export function combineSubgraphs(components: readonly (readonly PositionedNode[])[]): void {
  const sorted = components.map((nodes, index) => ({ nodes, index, box: bounds(nodes) }))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height
      || a.index - b.index);
  const packed: PositionedNode[] = [];
  const candidatePoints: Point[] = [];
  let combinedRight = -Infinity;
  let combinedBottom = -Infinity;

  for (const { nodes, box } of sorted) {
    let chosen: Point = { x: 0, y: 0 };
    let chosenIndex = 0;
    let lowestCost = Infinity;
    for (let index = 0; index < candidatePoints.length; index++) {
      const candidate = candidatePoints[index]!;
      const dx = candidate.x - box.minX;
      const dy = candidate.y - box.minY;
      if (nodes.some((node) => packed.some((other) => overlapsWithGap(node, dx, dy, other)))) continue;
      const width = Math.max(combinedRight, candidate.x + box.width);
      const height = Math.max(combinedBottom, candidate.y + box.height);
      const cost = width * height + (width - height) ** 2 * 0.5;
      if (cost < lowestCost) {
        lowestCost = cost;
        chosen = candidate;
        chosenIndex = index;
      }
    }
    if (candidatePoints.length) {
      candidatePoints[chosenIndex] = candidatePoints[candidatePoints.length - 1]!;
      candidatePoints.pop();
    }
    const dx = chosen.x - box.minX;
    const dy = chosen.y - box.minY;
    for (const node of nodes) {
      node.x += dx;
      node.y += dy;
      packed.push(node);
    }
    const right = chosen.x + box.width;
    const bottom = chosen.y + box.height;
    combinedRight = Math.max(combinedRight, right);
    combinedBottom = Math.max(combinedBottom, bottom);
    candidatePoints.push(
      { x: right, y: chosen.y }, { x: right, y: bottom }, { x: chosen.x, y: bottom },
      { x: right + NodeGap, y: chosen.y }, { x: right + NodeGap, y: bottom },
      { x: chosen.x, y: bottom + NodeGap },
    );
  }
}
