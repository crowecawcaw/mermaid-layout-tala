import type { LayoutDirection, LayoutEdge, LayoutNode, PositionedNode } from '../layout.js';
import { extractFlatTrees, type ExtractedTree } from './tree-extraction.js';

// The ordinary arborescence branch of upstream trees: a branching root owns
// its descendants, siblings have a 50-unit gap, and levels have a 100-unit gap.
// Nonbranching chains stay in general placement, as upstream does.
const siblingSpacing = 50;
const parentSpacing = 100;
const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

export function placeSimpleTree(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, ranks: ReadonlyMap<string, number>, allowChain = false): PositionedNode[] | undefined {
  if (nodes.length < (allowChain ? 2 : 3) || edges.length !== nodes.length - 1 || nodes.some((node) => node.isGroup)) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  let children = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edge.directed === false || edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) return;
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
    children.get(edge.from)!.push(edge.to);
  }
  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  if (roots.length !== 1 || nodes.some((node) => incoming.get(node.id)! > 1)) return;
  if (!allowChain && ![...children.values()].some((list) => list.length > 1)) return;
  const root = roots[0]!;
  if (!allowChain) {
    const extracted = extractFlatTrees(nodes, edges);
    if (extracted.remaining.length === 1 && extracted.remaining[0] !== root.id
      && extracted.trees.length === 1) {
      const split = placeSplitTree(nodes, edges, direction, ranks, extracted.remaining[0]!,
        extracted.trees[0]!.roots);
      if (split) return split;
    }
  }
  // Upstream extracts leaves in rounds and appends each fringe node when it
  // attaches to its sentinel. This orders a deep branch after a shallow leaf.
  const ordered = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const remaining = new Set(nodes.map((node) => node.id));
  while (remaining.size > 1) {
    const fringe = nodes.filter((node) => node.id !== root.id && remaining.has(node.id)
      && edges.filter((edge) => remaining.has(edge.from) && remaining.has(edge.to)
        && (edge.from === node.id || edge.to === node.id)).length === 1);
    if (fringe.length === 0) break;
    for (const node of fringe) {
      const parent = edges.find((edge) => remaining.has(edge.from) && remaining.has(edge.to)
        && (edge.from === node.id || edge.to === node.id))!;
      ordered.get(parent.from === node.id ? parent.to : parent.from)!.push(node.id);
    }
    for (const node of fringe) remaining.delete(node.id);
  }
  if (remaining.size === 1 && [...remaining][0] === root.id) children = ordered;
  if (direction === 'BT' || direction === 'RL') {
    for (const list of children.values()) list.reverse();
  }
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
  const rows = new Map<number, string[]>();
  const cross = new Map<string, number>();
  const points = new Map<string, { x: number; y: number }>();
  for (const id of queue) {
    const level = levels.get(id)!;
    const row = rows.get(level) ?? [];
    row.push(id);
    rows.set(level, row);
    cross.set(id, 0);
    const primary = goRound(levelCenters[level]! - primarySize(id) / 2);
    points.set(id, horizontal ? { x: primary, y: 0 } : { x: 0, y: primary });
  }
  const shiftSubtree = (id: string, amount: number): void => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      cross.set(current, cross.get(current)! + amount);
      stack.push(...children.get(current)!);
    }
  };
  const childrenCenter = (id: string): number => {
    const childIds = children.get(id)!;
    return childIds.reduce((sum, child) => sum + cross.get(child)! + crossSize(child) / 2, 0) / childIds.length;
  };
  for (let level = maxPrimary.length - 1; level > 0; level--) {
    const row = rows.get(level)!;
    const next = rows.get(level + 1) ?? [];
    let nextPosition = 0;
    for (const id of row) {
      const childIds = children.get(id)!;
      if (childIds.length === 0) {
        cross.set(id, nextPosition);
      } else {
        const lastChildIndex = next.lastIndexOf(childIds.at(-1)!);
        const gap = (left: string, right: string) => cross.get(right)! - cross.get(left)! - crossSize(left);
        const before = childIds.slice(1).reduce((sum, child, index) => sum + gap(childIds[index]!, child), 0);
        let widest = siblingSpacing;
        for (let index = 1; index < childIds.length; index++) widest = Math.max(widest, gap(childIds[index - 1]!, childIds[index]!));
        for (let index = 1; index < childIds.length; index++) {
          const amount = widest - gap(childIds[index - 1]!, childIds[index]!);
          if (amount > 0) shiftSubtree(childIds[index]!, amount);
        }
        const after = childIds.slice(1).reduce((sum, child, index) => sum + gap(childIds[index]!, child), 0);
        if (after > before) for (const following of next.slice(lastChildIndex + 1)) shiftSubtree(following, after - before);
        cross.set(id, goRound(childrenCenter(id) - crossSize(id) / 2));
        const difference = nextPosition - cross.get(id)!;
        if (difference > 0) {
          shiftSubtree(id, difference);
          for (const following of next.slice(lastChildIndex + 1)) shiftSubtree(following, difference);
        }
      }
      nextPosition = cross.get(id)! + crossSize(id) + siblingSpacing;
    }
  }
  const rootChildren = children.get(root.id)!;
  shiftSubtree(root.id, goRound(cross.get(root.id)! + crossSize(root.id) / 2 - childrenCenter(root.id)));
  // The root itself remains at its initial position; only descendants move.
  cross.set(root.id, 0);
  for (const id of queue) {
    const point = points.get(id)!;
    if (horizontal) point.y = cross.get(id)!;
    else point.x = cross.get(id)!;
  }
  if (direction === 'BT' || direction === 'RL') {
    for (const node of nodes) {
      const point = points.get(node.id)!;
      if (direction === 'BT') point.y = -point.y - node.height;
      else point.x = -point.x - node.width;
    }
  }
  // Upstream placement.direct mirrors a placed tree toward the dominant edge
  // direction. A deep branch can make the cross-axis direction unbalanced.
  const directions = ['right', 'bottom', 'left', 'top'] as const;
  type Side = typeof directions[number];
  const counts = new Map<Side, number>(directions.map((side) => [side, 0]));
  for (const edge of edges) {
    const from = points.get(edge.from)!, to = points.get(edge.to)!;
    const a = byId.get(edge.from)!, b = byId.get(edge.to)!;
    if (to.x >= from.x + a.width) counts.set('right', counts.get('right')! + 1);
    if (to.x + b.width <= from.x) counts.set('left', counts.get('left')! + 1);
    if (to.y >= from.y + a.height) counts.set('bottom', counts.get('bottom')! + 1);
    if (to.y + b.height <= from.y) counts.set('top', counts.get('top')! + 1);
  }
  const preferred: Side = direction === 'LR' ? 'right' : direction === 'RL' ? 'left'
    : direction === 'BT' ? 'top' : 'bottom';
  const ranked = [...directions].sort((a, b) => counts.get(b)! - counts.get(a)!
    || Number(b === preferred) - Number(a === preferred));
  const opposite = (a: Side, b: Side) => a === 'right' && b === 'left' || a === 'left' && b === 'right'
    || a === 'top' && b === 'bottom' || a === 'bottom' && b === 'top';
  const primary = ranked[0]!;
  const secondary = opposite(ranked[1]!, primary) ? ranked[2]! : ranked[1]!;
  const mirror = { x: false, y: false };
  const selectMirror = (side: Side): void => {
    if (side === 'left' || side === 'right') mirror.x = side !== (horizontal ? preferred : 'right');
    else mirror.y = side !== (horizontal ? 'bottom' : preferred);
  };
  selectMirror(primary);
  if (counts.get(secondary)! > counts.get(ranked[3]!)!) selectMirror(secondary);
  if (mirror.x || mirror.y) {
    for (const node of nodes) {
      const point = points.get(node.id)!;
      if (mirror.x) point.x = -point.x - node.width;
      if (mirror.y) point.y = -point.y - node.height;
    }
  }
  const crossOrder = new Map<string, number>();
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

function placeSplitTree(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  direction: LayoutDirection, ranks: ReadonlyMap<string, number>, sentinel: string,
  roots: readonly ExtractedTree[]): PositionedNode[] | undefined {
  const opposite: Record<LayoutDirection, LayoutDirection> = { TB: 'BT', BT: 'TB', LR: 'RL', RL: 'LR' };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<'out' | 'in', ExtractedTree[]>([['out', []], ['in', []]]);
  for (const root of roots) {
    const edge = edges.find((edge) => edge.from === sentinel && edge.to === root.id
      || edge.to === sentinel && edge.from === root.id);
    if (!edge || edge.directed === false) return;
    groups.get(edge.from === sentinel ? 'out' : 'in')!.push(root);
  }
  if (!groups.get('out')!.length || !groups.get('in')!.length) return;
  const placed = new Map<string, PositionedNode>();
  for (const [side, sideRoots] of groups) {
    const ids = new Set<string>([sentinel]);
    const orientedEdges: LayoutEdge[] = [];
    const collect = (tree: ExtractedTree, parent: string): void => {
      ids.add(tree.id);
      orientedEdges.push({ id: `${parent}:${tree.id}`, from: parent, to: tree.id, directed: true });
      for (const child of tree.children) collect(child, tree.id);
    };
    for (const tree of sideRoots) collect(tree, sentinel);
    const local = placeSimpleTree(nodes.filter((node) => ids.has(node.id)), orientedEdges,
      side === 'out' ? direction : opposite[direction], ranks, true);
    if (!local) return;
    const localRoot = local.find((node) => node.id === sentinel)!;
    const root = byId.get(sentinel)!;
    for (const node of local) {
      const x = node.x - localRoot.x + root.width / 2;
      let y = node.y - localRoot.y + root.height / 2;
      // Upstream constructs the rightward incoming branch from its leftward
      // canonical tree, reflecting sibling order across the root's center.
      if (side === 'in' && direction === 'RL') y = root.height - y;
      placed.set(node.id, { ...node, x, y });
    }
  }
  if (placed.size !== nodes.length) return;
  const horizontal = direction === 'LR' || direction === 'RL';
  const rows = new Map<number, PositionedNode[]>();
  for (const node of placed.values()) {
    const row = rows.get(node.rank) ?? [];
    row.push(node);
    rows.set(node.rank, row);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => horizontal ? a.y - b.y : a.x - b.x);
    row.forEach((node, index) => { node.order = index; });
  }
  return nodes.map((node) => placed.get(node.id)!);
}
