import { TalaGraph, TalaNode } from './graph.js';
import { sizedOrientation, type Orientation } from './placement-geometry.js';
import { wrapContainers } from './equidistance.js';

/** Port of placement.BalanceSymmetry for ordinary nodes. */
export function balanceSymmetry(graph: TalaGraph): boolean {
  let changed = false;
  for (const node of graph.nodes) {
    if (!node.topLeft || node.isGroup || node.fixedTopLeft || node.inHierarchy
      || node.edges.length < 2) continue;
    const adjacent = new Set<TalaNode>();
    let sameSide = true;
    for (let i = 0; i < node.edges.length - 1; i++) {
      const first = node.edges[i]!, second = node.edges[i + 1]!;
      if (first.fromTableColumnIndex !== undefined || first.toTableColumnIndex !== undefined
        || second.fromTableColumnIndex !== undefined || second.toTableColumnIndex !== undefined) continue;
      const a = node.adjacent(first), b = node.adjacent(second);
      if (!a.topLeft || !b.topLeft || !orientationsShareSide(
        sizedOrientation(node, a), sizedOrientation(node, b))) {
        sameSide = false;
        break;
      }
      adjacent.add(a);
      adjacent.add(b);
    }
    const neighbors = [...adjacent];
    if (!sameSide || neighbors.length < 2 || axisScore(neighbors) !== 1) continue;
    const largestArea = Math.max(...neighbors.map((item) => item.width * item.height));
    if (neighbors.some((item) => item.width * item.height < largestArea / 2)) continue;
    const neighborAxis = sizedOrientation(neighbors[0]!, neighbors[1]!);
    const horizontal = neighborAxis !== 'Top' && neighborAxis !== 'Bottom';
    const left = Math.min(...neighbors.map((item) => item.topLeft!.x));
    const right = Math.max(...neighbors.map((item) => item.topLeft!.x + item.width));
    const top = Math.min(...neighbors.map((item) => item.topLeft!.y));
    const bottom = Math.max(...neighbors.map((item) => item.topLeft!.y + item.height));
    const dx = horizontal ? Math.floor((left + right) / 2 - node.topLeft.x - node.width / 2) : 0;
    const dy = horizontal ? 0 : Math.floor((top + bottom) / 2 - node.topLeft.y - node.height / 2);
    if (dx === 0 && dy === 0) continue;
    const before = graph.nodes.map((item) => ({ item, x: item.topLeft!.x, y: item.topLeft!.y,
      width: item.width, height: item.height }));
    moveWithChildren(node, dx, dy);
    wrapContainers(graph);
    if (validGeometry(graph)) changed = true;
    else for (const item of before) {
      item.item.topLeft = { x: item.x, y: item.y };
      item.item.width = item.width;
      item.item.height = item.height;
    }
  }
  return changed;
}

function orientationsShareSide(a: Orientation, b: Orientation): boolean {
  return [
    ['TopLeft', 'Top', 'TopRight'],
    ['BottomLeft', 'Bottom', 'BottomRight'],
    ['Left', 'TopLeft', 'BottomLeft'],
    ['Right', 'TopRight', 'BottomRight'],
  ].some((side) => side.includes(a) && side.includes(b));
}

/** placementcost.AxisScore, including its three-point axis samples. */
function axisScore(nodes: readonly TalaNode[]): number {
  if (nodes.length < 2) return 1;
  if (nodes.length === 2) return isDiagonal(sizedOrientation(nodes[0]!, nodes[1]!)) ? 0 : 1;
  const widest = nodes.reduce((best, node) => node.width > best.width ? node : best);
  const tallest = nodes.reduce((best, node) => node.height > best.height ? node : best);
  if (nodes.every((node) => node === tallest || isHorizontal(sizedOrientation(node, tallest)))) {
    return sampleAxis(nodes, tallest, 'y');
  }
  if (nodes.every((node) => node === widest || isVertical(sizedOrientation(node, widest)))) {
    return sampleAxis(nodes, widest, 'x');
  }
  return 0;
}

function sampleAxis(nodes: readonly TalaNode[], anchor: TalaNode, axis: 'x' | 'y'): number {
  let total = 0;
  const anchorSize = axis === 'x' ? anchor.width : anchor.height;
  for (const node of nodes) {
    if (node === anchor) continue;
    const size = axis === 'x' ? node.width : node.height;
    const low = node.topLeft![axis], high = low + size;
    let score = 0;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const coordinate = anchor.topLeft![axis] + fraction * anchorSize;
      if (low <= coordinate && coordinate <= high) score += 0.33;
    }
    if (size < anchorSize * 0.25) score *= 3;
    else if (size < anchorSize * 0.75) score *= 2;
    total += score === 0.99 ? 1 : score;
  }
  return Math.max(0.33, total / (nodes.length - 1));
}

function moveWithChildren(node: TalaNode, dx: number, dy: number): void {
  node.topLeft = { x: node.topLeft!.x + dx, y: node.topLeft!.y + dy };
  for (const child of node.children) moveWithChildren(child, dx, dy);
}

function validGeometry(graph: TalaGraph): boolean {
  for (let i = 0; i < graph.nodes.length; i++) {
    const first = graph.nodes[i]!;
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const second = graph.nodes[j]!;
      if (first.parent !== second.parent) continue;
      if (first.topLeft!.x < second.topLeft!.x + second.width
        && first.topLeft!.x + first.width > second.topLeft!.x
        && first.topLeft!.y < second.topLeft!.y + second.height
        && first.topLeft!.y + first.height > second.topLeft!.y) return false;
    }
  }
  return true;
}

function isDiagonal(value: Orientation): boolean {
  return value === 'TopLeft' || value === 'TopRight'
    || value === 'BottomLeft' || value === 'BottomRight';
}
function isHorizontal(value: Orientation): boolean { return value === 'Left' || value === 'Right'; }
function isVertical(value: Orientation): boolean { return value === 'Top' || value === 'Bottom'; }
