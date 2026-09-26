import type { LayoutDirection, LayoutEdge, Point, PositionedNode } from '../layout.js';
import type { ExtractedTree, TreeExtraction } from './tree-extraction.js';

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

/** Routes each extracted branch in its actual placement direction. */
export function canonicalTreePaths(nodes: readonly PositionedNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, extraction: TreeExtraction): Map<string, Point[]> | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths = new Map<string, Point[]>();
  const vertical = direction === 'TB' || direction === 'BT';
  const visit = (parentId: string, trees: readonly ExtractedTree[]): boolean => {
    for (const tree of trees) {
      const parent = byId.get(parentId), child = byId.get(tree.id);
      if (!parent || !child) return false;
      const candidates = edges.filter((edge) => edge.from === parentId && edge.to === tree.id
        || edge.to === parentId && edge.from === tree.id);
      if (candidates.length !== 1) return false;
      const edge = candidates[0]!;
      const orientation = vertical ? child.y >= parent.y ? 'TB' : 'BT'
        : child.x >= parent.x ? 'LR' : 'RL';
      const points = canonicalTreePath(parent, child, orientation);
      paths.set(edge.id, edge.from === tree.id ? points.reverse() : points);
      if (!visit(tree.id, tree.children)) return false;
    }
    return true;
  };
  for (const entry of extraction.trees) if (!visit(entry.sentinel, entry.roots)) return;
  return paths.size === edges.length ? paths : undefined;
}
