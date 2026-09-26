import type { LayoutDirection, LayoutEdge, Point, PositionedNode } from '../layout.js';

/** The treeEdgeMidpoints path for an outward branch with center ports. */
export function canonicalTreePath(source: PositionedNode, target: PositionedNode,
  direction: LayoutDirection): Point[] {
  const round = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);
  const start: Point = { x: round(source.x), y: round(source.y) };
  const end: Point = { x: round(target.x), y: round(target.y) };
  const crossAxis = direction === 'TB' || direction === 'BT' ? 'x' : 'y';
  const targetStart = crossAxis === 'x' ? target.x - target.width / 2 : target.y - target.height / 2;
  const targetEnd = crossAxis === 'x' ? target.x + target.width / 2 : target.y + target.height / 2;
  if (Math.abs(source[crossAxis] - target[crossAxis]) <= 10
    && start[crossAxis] > targetStart + 5 && start[crossAxis] < targetEnd - 5) {
    end[crossAxis] = start[crossAxis];
  }
  if (direction === 'TB') { start.y = source.y + source.height / 2; end.y = target.y - target.height / 2; }
  else if (direction === 'BT') { start.y = source.y - source.height / 2; end.y = target.y + target.height / 2; }
  else if (direction === 'LR') { start.x = source.x + source.width / 2; end.x = target.x - target.width / 2; }
  else { start.x = source.x - source.width / 2; end.x = target.x + target.width / 2; }
  const middle = direction === 'TB' ? source.y + source.height / 2 + 50
    : direction === 'BT' ? source.y - source.height / 2 - 50
      : direction === 'LR' ? source.x + source.width / 2 + 50
        : source.x - source.width / 2 - 50;
  const points: Point[] = direction === 'TB' || direction === 'BT'
    ? [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end]
    : [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x
    || point.y !== points[index - 1]!.y).filter((point, index, list) => index === 0 || index === list.length - 1
      || !(list[index - 1]!.x === point.x && point.x === list[index + 1]!.x)
        && !(list[index - 1]!.y === point.y && point.y === list[index + 1]!.y));
}

export function isOutwardTree(nodes: readonly PositionedNode[], edges: readonly LayoutEdge[]): boolean {
  if (nodes.length < 2 || edges.length !== nodes.length - 1) return false;
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (edge.directed === false || !incoming.has(edge.from) || !incoming.has(edge.to)) return false;
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
  }
  return [...incoming.values()].filter((count) => count === 0).length === 1
    && [...incoming.values()].every((count) => count <= 1);
}
