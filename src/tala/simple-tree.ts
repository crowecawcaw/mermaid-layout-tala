import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode } from '../layout.js';

// The ordinary arborescence branch of upstream trees: a branching root owns
// its descendants, siblings have a 50-unit gap, and levels have a 100-unit gap.
// Nonbranching chains stay in general placement, as upstream does.
const siblingSpacing = 50;
const parentSpacing = 100;

export function placeSimpleTree(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, ranks: ReadonlyMap<string, number>): PositionedNode[] | undefined {
  if (nodes.length < 3 || edges.length !== nodes.length - 1 || nodes.some((node) => node.isGroup)) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edge.directed === false || edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) return;
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
    children.get(edge.from)!.push(edge.to);
  }
  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  if (roots.length !== 1 || nodes.some((node) => incoming.get(node.id)! > 1)) return;
  if (![...children.values()].some((list) => list.length > 1)) return;
  if (direction === 'BT' || direction === 'RL') {
    for (const list of children.values()) list.reverse();
  }
  const root = roots[0]!;
  const levels = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const child of children.get(id)!) {
      if (levels.has(child)) return;
      levels.set(child, levels.get(id)! + 1);
      queue.push(child);
    }
  }
  if (levels.size !== nodes.length) return;

  const horizontal = direction === 'LR' || direction === 'RL';
  const crossSize = (id: string) => horizontal ? byId.get(id)!.height : byId.get(id)!.width;
  const primarySize = (id: string) => horizontal ? byId.get(id)!.width : byId.get(id)!.height;
  const subtreeWidth = new Map<string, number>();
  for (const id of [...queue].reverse()) {
    const childIds = children.get(id)!;
    const total = childIds.reduce((sum, child) => sum + subtreeWidth.get(child)!, 0)
      + Math.max(0, childIds.length - 1) * siblingSpacing;
    subtreeWidth.set(id, Math.max(crossSize(id), total));
  }
  const crossCenter = new Map<string, number>();
  const placeSubtree = (id: string, left: number): void => {
    const childIds = children.get(id)!;
    if (childIds.length === 0) {
      crossCenter.set(id, left + subtreeWidth.get(id)! / 2);
      return;
    }
    const childWidth = childIds.reduce((sum, child) => sum + subtreeWidth.get(child)!, 0)
      + (childIds.length - 1) * siblingSpacing;
    let cursor = left + (subtreeWidth.get(id)! - childWidth) / 2;
    for (const child of childIds) {
      placeSubtree(child, cursor);
      cursor += subtreeWidth.get(child)! + siblingSpacing;
    }
    crossCenter.set(id, (crossCenter.get(childIds[0]!)! + crossCenter.get(childIds.at(-1)!)!) / 2);
  };
  placeSubtree(root.id, 0);

  const maxPrimary: number[] = [];
  for (const id of queue) {
    const level = levels.get(id)!;
    maxPrimary[level] = Math.max(maxPrimary[level] ?? 0, primarySize(id));
  }
  const levelCenters: number[] = [];
  let current = 0;
  for (const size of maxPrimary) {
    levelCenters.push(current + size / 2);
    current += size + parentSpacing;
  }
  const points = new Map<string, { x: number; y: number }>();
  for (const id of queue) {
    const node = byId.get(id)!;
    const cross = Math.round(crossCenter.get(id)! - crossSize(id) / 2);
    const primary = Math.round(levelCenters[levels.get(id)!]! - primarySize(id) / 2);
    points.set(id, horizontal ? { x: primary, y: cross } : { x: cross, y: primary });
  }
  if (direction === 'BT' || direction === 'RL') {
    for (const node of nodes) {
      const point = points.get(node.id)!;
      if (direction === 'BT') point.y = -point.y - node.height;
      else point.x = -point.x - node.width;
    }
  }
  const crossOrder = new Map<string, number>();
  const rows = new Map<number, string[]>();
  for (const id of queue) {
    const row = rows.get(levels.get(id)!) ?? [];
    row.push(id);
    rows.set(levels.get(id)!, row);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => (horizontal ? points.get(a)!.y - points.get(b)!.y : points.get(a)!.x - points.get(b)!.x));
    row.forEach((id, index) => crossOrder.set(id, index));
  }
  return nodes.map((node) => ({
    ...node,
    x: points.get(node.id)!.x + node.width / 2,
    y: points.get(node.id)!.y + node.height / 2,
    rank: ranks.get(node.id) ?? levels.get(node.id)!,
    order: crossOrder.get(node.id)!,
  }));
}
