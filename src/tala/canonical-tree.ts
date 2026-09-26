import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode } from '../layout.js';
import { directionTransforms } from './direct.js';

interface TreeBox { id: string; x: number; y: number; width: number; height: number }
const siblingSpacing = 50;
const parentSpacing = 100;
const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

/** Direct translation of trees.constructToOrientation's ordinary node geometry. */
export function placeCanonicalTree(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  root: string, children: ReadonlyMap<string, readonly string[]>, direction: LayoutDirection,
  ranks: ReadonlyMap<string, number>): PositionedNode[] | undefined {
  const boxes = new Map<string, TreeBox>();
  for (const node of nodes) {
    let { width, height } = node;
    let x = 0, y = 0;
    if (direction === 'LR' || direction === 'RL') [width, height] = [height, width];
    if (direction === 'BT' || direction === 'RL') { x = -width; y = -height; }
    boxes.set(node.id, { id: node.id, x, y, width, height });
  }
  if (!boxes.has(root)) return;
  const parent = new Map<string, string>();
  const rows = new Map<number, string[]>([[0, [root]]]);
  const queue = [root];
  const depth = new Map<string, number>([[root, 0]]);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const child of children.get(id) ?? []) {
      if (!boxes.has(child) || depth.has(child)) return;
      const level = depth.get(id)! + 1;
      depth.set(child, level);
      parent.set(child, id);
      const row = rows.get(level) ?? [];
      row.push(child);
      rows.set(level, row);
      queue.push(child);
    }
  }
  if (queue.length !== nodes.length) return;
  const shiftSubtree = (id: string, delta: number): void => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      boxes.get(current)!.x += delta;
      stack.push(...children.get(current) ?? []);
    }
  };
  const childCenter = (id: string): number => {
    const list = children.get(id)!;
    return list.reduce((sum, child) => {
      const box = boxes.get(child)!;
      return sum + box.x + box.width / 2;
    }, 0) / list.length;
  };
  const gap = (a: string, b: string) => boxes.get(b)!.x - boxes.get(a)!.x - boxes.get(a)!.width;
  const totalSpacing = (id: string): number => {
    const list = children.get(id)!;
    let total = 0;
    for (let i = 1; i < list.length; i++) total += gap(list[i - 1]!, list[i]!);
    return total;
  };
  const descendantExtents = (id: string, left: boolean): number[] => {
    const levels: string[][] = [[id]];
    for (let i = 0; i < levels.length; i++) {
      const next = levels[i]!.flatMap((current) => [...children.get(current) ?? []]);
      if (next.length) levels.push(next);
    }
    return levels.map((level) => {
      const box = boxes.get(left ? level[0]! : level.at(-1)!)!;
      return left ? box.x : box.x + box.width;
    });
  };
  const spacingBefore = (id: string, index: number): number => {
    const list = children.get(id)!;
    const rights = descendantExtents(list[index - 1]!, false);
    const lefts = descendantExtents(list[index]!, true);
    let minimum = lefts[0]! - rights[0]!;
    for (let i = 1; i < lefts.length && i < rights.length; i++) {
      minimum = Math.min(minimum, lefts[i]! - rights[i]!);
    }
    return minimum;
  };
  const spaceChildrenEvenly = (id: string): void => {
    const list = children.get(id)!;
    let widest = siblingSpacing;
    const gaps = [0];
    for (let i = 1; i < list.length; i++) {
      const space = gap(list[i - 1]!, list[i]!);
      widest = Math.max(widest, space);
      gaps.push(space);
    }
    for (let i = 1; i < list.length; i++) {
      const shift = widest - gaps[i]!;
      if (shift === 0) continue;
      if (spacingBefore(id, i) + shift > 10 * siblingSpacing) return;
      if (i + 1 < list.length) gaps[i + 1]! -= shift;
    }
    for (let i = 1; i < list.length; i++) {
      const shift = widest - gaps[i]!;
      if (shift > 0) shiftSubtree(list[i]!, shift);
    }
  };
  const maxHeights: number[] = [];
  for (const [level, row] of rows) maxHeights[level] = Math.max(...row.map((id) => boxes.get(id)!.height));
  const levelSpacing: number[] = [];
  for (let level = 0; level + 1 < rows.size; level++) {
    let spacing = parentSpacing;
    for (const id of rows.get(level)!) {
      const childIds = children.get(id) ?? [];
      if (childIds.length === 0) continue;
      let labelSize = 0;
      for (const child of childIds) {
        const edge = edges.find((item) => item.from === id && item.to === child
          || item.to === id && item.from === child);
        const size = direction === 'LR' || direction === 'RL'
          ? edge?.labelBBox?.width : edge?.labelBBox?.height;
        labelSize = Math.max(labelSize, size ?? 0);
      }
      if (labelSize > 0) {
        const clearance = labelSize + 40;
        spacing = Math.max(spacing, childIds.length === 1 ? clearance
          : parentSpacing / 2 + Math.max(parentSpacing / 2, clearance));
      }
    }
    levelSpacing[level + 1] = spacing;
  }
  let levelBottom = boxes.get(root)!.y + maxHeights[0]!;
  for (let level = 1; level < rows.size; level++) {
    const top = levelBottom + levelSpacing[level]!;
    for (const id of rows.get(level)!) {
      const box = boxes.get(id)!;
      box.y = top + goRound((maxHeights[level]! - box.height) / 2);
    }
    levelBottom = top + maxHeights[level]!;
  }
  for (let level = rows.size - 1; level > 0; level--) {
    const row = rows.get(level)!;
    const next = rows.get(level + 1) ?? [];
    let nextPosition = 0;
    for (const id of row) {
      const box = boxes.get(id)!;
      const childIds = children.get(id) ?? [];
      if (childIds.length === 0) box.x = nextPosition;
      else {
        let lastChildIndex = next.length;
        for (let index = next.length - 1; index >= 0; index--) {
          if (parent.get(next[index]!) === id) { lastChildIndex = index; break; }
        }
        const shiftFollowing = (delta: number): void => {
          for (const following of next.slice(lastChildIndex + 1)) shiftSubtree(following, delta);
        };
        const before = totalSpacing(id);
        spaceChildrenEvenly(id);
        const after = totalSpacing(id);
        if (after > before) shiftFollowing(after - before);
        box.x = goRound(childCenter(id) - box.width / 2);
        const difference = nextPosition - box.x;
        if (difference > 0) { shiftSubtree(id, difference); shiftFollowing(difference); }
      }
      nextPosition = box.x + box.width + siblingSpacing;
    }
  }
  const rootChildren = children.get(root) ?? [];
  if (rootChildren.length) {
    const rootBox = boxes.get(root)!;
    const offset = goRound(rootBox.x + rootBox.width / 2 - childCenter(root));
    for (const child of rootChildren) shiftSubtree(child, offset);
  }
  for (const box of boxes.values()) {
    if (direction === 'BT') { box.x = -box.x - box.width; box.y = -box.y - box.height; }
    else if (direction === 'LR') [box.x, box.y, box.width, box.height] = [box.y, box.x, box.height, box.width];
    else if (direction === 'RL') {
      [box.x, box.y, box.width, box.height] = [box.y, box.x, box.height, box.width];
      box.x = -box.x - box.width;
      box.y = -box.y - box.height;
    }
  }
  const mirror = directionTransforms([...boxes.values()], edges, direction);
  if (mirror.mirrorX || mirror.mirrorY) for (const box of boxes.values()) {
    if (mirror.mirrorX) box.x = -box.x - box.width;
    if (mirror.mirrorY) box.y = -box.y - box.height;
  }
  const horizontal = direction === 'LR' || direction === 'RL';
  const order = new Map<string, number>();
  for (const row of rows.values()) {
    row.sort((a, b) => horizontal ? boxes.get(a)!.y - boxes.get(b)!.y
      : boxes.get(a)!.x - boxes.get(b)!.x);
    row.forEach((id, index) => order.set(id, index));
  }
  return nodes.map((node) => {
    const box = boxes.get(node.id)!;
    return { ...node, x: box.x + box.width / 2, y: box.y + box.height / 2,
      rank: ranks.get(node.id) ?? depth.get(node.id)!, order: order.get(node.id)! };
  });
}
