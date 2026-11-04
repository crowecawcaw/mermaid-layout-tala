// Translated from internal/trees/geometry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Orientation, IsHorizontal } from '../geo/orientation.js';
import { Round } from '../geo/math.js';
import { Position, Mirrored } from '../label/label.js';
import { Tree } from '../layoutgraph/records.js';
import { Node } from '../layoutgraph/node.js';
import {
  TreeParentSpacing,
  MinArrowheadClearance,
} from '../layoutgraph/geometry-policy.js';
import { WorkGuard } from '../limits/work.js';
import { New as invariant } from '../invariant/errors.js';
export const siblingSpacing = 50,
  directionPenalty = 2 * TreeParentSpacing;
export function treePreprocessBadState(reason: string): Error {
  return invariant(reason);
}
export function levelsByDepth(t: Tree, guard: WorkGuard): Tree[][] {
  if (!t)
    throw treePreprocessBadState('tree placement cannot traverse a nil tree');
  const queue = [{ tree: t, level: 0 }],
    seen = new Set<Tree>(),
    levels: Tree[][] = [];
  for (let index = 0; index < queue.length; index++) {
    guard.Step();
    const current = queue[index]!;
    if (!current.tree || !current.tree.Node)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current.tree))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current.tree);
    (levels[current.level] ??= []).push(current.tree);
    for (const child of current.tree.Children) {
      guard.Step();
      queue.push({ tree: child, level: current.level + 1 });
    }
  }
  return levels;
}
export function shiftSubtreeHorizontally(
  t: Tree,
  delta: number,
  guard: WorkGuard,
): void {
  offsetSubtree(t, delta, 0, guard);
}
export function spacingToChildren(t: Tree, guard: WorkGuard): number {
  let maxLabelSize = 0;
  for (const c of t.Children) {
    guard.Step();
    if (!c || !c.SentinelEdge)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete child edge',
      );
    const size = IsHorizontal(t.Orientation)
      ? c.SentinelEdge.MinWidth
      : c.SentinelEdge.MinHeight;
    maxLabelSize = Math.max(maxLabelSize, size);
  }
  if (maxLabelSize === 0) return TreeParentSpacing;
  const spacing = maxLabelSize + 2 * MinArrowheadClearance;
  if (t.Children.length === 1) return Math.max(TreeParentSpacing, spacing);
  return TreeParentSpacing / 2 + Math.max(TreeParentSpacing / 2, spacing);
}
export function layoutTree(t: Tree, guard: WorkGuard): void {
  const levels = levelsByDepth(t, guard),
    heights: number[] = [],
    spacings: number[] = [];
  for (let level = 0; level < levels.length; level++) {
    let height = 0;
    for (const current of levels[level]!) {
      guard.Step();
      height = Math.max(height, current.Node.Height);
    }
    heights[level] = height;
  }
  for (let level = 0; level < levels.length - 1; level++)
    for (const current of levels[level]!) {
      guard.Step();
      const spacing = spacingToChildren(current, guard);
      spacings[level + 1] = Math.max(spacings[level + 1] ?? 0, spacing);
    }
  let bottom = 0;
  for (let level = 1; level < levels.length; level++) {
    const top = bottom + spacings[level]!;
    for (const current of levels[level]!) {
      guard.Step();
      const offset = Round((heights[level]! - current.Node.Height) / 2);
      moveTreeNodeAbsWithChildren(
        current.Node,
        current.Node.TopLeft!.X,
        top + offset,
        guard,
      );
    }
    bottom = top + heights[level]!;
  }
  for (let level = levels.length - 1; level > 0; level--) {
    let nextPosition = 0;
    for (const current of levels[level]!) {
      guard.Step();
      if (current.Children.length === 0)
        moveTreeNodeAbsWithChildren(
          current.Node,
          nextPosition,
          current.Node.TopLeft!.Y,
          guard,
        );
      else {
        let lastChildPosition = levels[level + 1]!.length;
        for (let i = lastChildPosition - 1; i >= 0; i--) {
          guard.Step();
          if (levels[level + 1]![i]!.Parent === current) {
            lastChildPosition = i;
            break;
          }
        }
        const shiftSubsequent = (dx: number) => {
          for (
            let i = lastChildPosition + 1;
            i < levels[level + 1]!.length;
            i++
          ) {
            guard.Step();
            shiftSubtreeHorizontally(levels[level + 1]![i]!, dx, guard);
          }
        };
        const before = totalChildrenSpacing(current, guard);
        spaceChildrenEvenly(current, guard);
        const after = totalChildrenSpacing(current, guard),
          shift = after - before;
        if (shift > 0) shiftSubsequent(shift);
        const center = childrenCenterX(current, guard);
        moveTreeNodeAbsWithChildren(
          current.Node,
          Round(center - current.Node.Width / 2),
          current.Node.TopLeft!.Y,
          guard,
        );
        const diff = nextPosition - current.Node.TopLeft!.X;
        if (diff > 0) {
          shiftSubtreeHorizontally(current, diff, guard);
          shiftSubsequent(diff);
        }
      }
      nextPosition =
        current.Node.TopLeft!.X + current.Node.Width + siblingSpacing;
    }
  }
  guard.Finish();
}
export function validateBottomOrientation(t: Tree, guard: WorkGuard): void {
  const stack = [t],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node || !current.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current);
    if (current.Parent) {
      if (!current.Parent.Node || !current.Parent.Node.TopLeft)
        throw treePreprocessBadState(
          'tree placement encountered an incomplete parent',
        );
      if (
        current.Node.TopLeft.Y <
        current.Parent.Node.TopLeft.Y + current.Parent.Node.Height
      )
        throw invariant(
          `tree node ${current.Node.ID} is not in Bottom orientation`,
        );
    }
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
  guard.Check();
}
export function positionEdgeLabels(t: Tree, guard: WorkGuard): void {
  if (!t)
    throw treePreprocessBadState('tree placement cannot label a nil tree');
  const stack = [{ tree: t, emit: false }],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const task = stack.pop()!,
      current = task.tree;
    if (!current || !current.Node)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete label tree',
      );
    if (!task.emit) {
      if (seen.has(current))
        throw treePreprocessBadState(
          'tree placement encountered a repeated tree node',
        );
      seen.add(current);
      stack.push({ tree: current, emit: true });
      for (let i = current.Children.length - 1; i >= 0; i--) {
        guard.Step();
        stack.push({ tree: current.Children[i]!, emit: false });
      }
      continue;
    }
    const edge = current.SentinelEdge;
    if (!edge)
      throw treePreprocessBadState(
        `tree node ${current.Node.ID} has no sentinel edge for label placement`,
      );
    if (!edge.Label) continue;
    const size = IsHorizontal(current.Orientation)
      ? edge.MinWidth
      : edge.MinHeight;
    if (size !== 0) {
      if (!current.Parent || !current.Parent.Node)
        throw treePreprocessBadState(
          `tree node ${current.Node.ID} has no parent for label placement`,
        );
      if (current.Parent.Children.length === 1) {
        edge.Label.Position = Position.UnlockedMiddle;
        edge.LabelPercentage = 0.5;
      } else {
        const child = current.Node,
          parent = current.Parent.Node,
          dx = child.Center().X - parent.Center().X,
          dy = child.TopLeft!.Y - (parent.TopLeft!.Y + parent.Height),
          total = Math.abs(dx) + dy,
          childLength = dy - TreeParentSpacing / 2;
        let distance = childLength / 2;
        const childToParent = edge.From === child;
        if (!childToParent) distance = total - childLength / 2;
        edge.LabelPercentage = distance / total;
        edge.Label.Position =
          dx < 0 ? Position.UnlockedBottom : Position.UnlockedTop;
        if (childToParent) edge.Label.Position = Mirrored(edge.Label.Position);
        if (IsHorizontal(current.Orientation))
          edge.Label.Position = Mirrored(edge.Label.Position);
      }
    }
    guard.Finish();
  }
}
export function childrenCenterX(t: Tree, guard: WorkGuard): number {
  if (!t.Children.length)
    throw treePreprocessBadState('tree placement cannot center a leaf');
  let center = 0;
  for (const child of t.Children) {
    guard.Step();
    if (!child || !child.Node || !child.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete child',
      );
    center += child.Node.TopLeft.X + child.Node.Width / 2;
  }
  return center / t.Children.length;
}
export function spaceChildrenEvenly(t: Tree, guard: WorkGuard): void {
  let max = siblingSpacing;
  const spacings = [0];
  for (let i = 1; i < t.Children.length; i++) {
    guard.Step();
    const s =
      t.Children[i]!.Node.TopLeft!.X -
      (t.Children[i - 1]!.Node.TopLeft!.X + t.Children[i - 1]!.Node.Width);
    max = Math.max(max, s);
    spacings.push(s);
  }
  for (let i = 1; i < t.Children.length; i++) {
    guard.Step();
    const shift = max - spacings[i]!;
    if (shift === 0) continue;
    const before = spacingBefore(t, i, guard);
    if (before + shift > 10 * siblingSpacing) return;
    if (i + 1 < t.Children.length) spacings[i + 1] = spacings[i + 1]! - shift;
  }
  for (let i = 1; i < t.Children.length; i++) {
    guard.Step();
    const shift = max - spacings[i]!;
    if (shift > 0) shiftSubtreeHorizontally(t.Children[i]!, shift, guard);
  }
}
export function totalChildrenSpacing(t: Tree, guard: WorkGuard): number {
  let spacing = 0;
  for (let i = 1; i < t.Children.length; i++) {
    guard.Step();
    spacing +=
      t.Children[i]!.Node.TopLeft!.X -
      (t.Children[i - 1]!.Node.TopLeft!.X + t.Children[i - 1]!.Node.Width);
  }
  return spacing;
}
export function spacingBefore(
  t: Tree,
  childIndex: number,
  guard: WorkGuard,
): number {
  const rights = levelRights(t.Children[childIndex - 1]!, guard),
    lefts = levelLefts(t.Children[childIndex]!, guard);
  let min = lefts[0]! - rights[0]!;
  for (let level = 1; level < lefts.length && level < rights.length; level++) {
    guard.Step();
    min = Math.min(min, lefts[level]! - rights[level]!);
  }
  return min;
}
export function levelLefts(t: Tree, guard: WorkGuard): number[] {
  const levels = levelsByDepth(t, guard),
    lefts: number[] = [];
  for (let level = 0; level < levels.length; level++) {
    if (!levels[level]!.length || !levels[level]![0]!.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete level',
      );
    guard.Step();
    lefts[level] = levels[level]![0]!.Node.TopLeft!.X;
  }
  return lefts;
}
export function levelRights(t: Tree, guard: WorkGuard): number[] {
  const levels = levelsByDepth(t, guard),
    rights: number[] = [];
  for (let level = 0; level < levels.length; level++) {
    if (!levels[level]!.length)
      throw treePreprocessBadState('tree placement encountered an empty level');
    const last = levels[level]!.at(-1)!;
    if (!last.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete level',
      );
    guard.Step();
    rights[level] = last.Node.TopLeft.X + last.Node.Width;
  }
  return rights;
}
export function centerAlignChildren(t: Tree, guard: WorkGuard): void {
  const center = childrenCenterX(t, guard),
    offset = Round(t.Node.TopLeft!.X + t.Node.Width / 2 - center);
  for (const child of t.Children) {
    guard.Step();
    offsetSubtree(child, offset, 0, guard);
  }
  guard.Finish();
}
export function treePlacementDescendants(node: Node, guard: WorkGuard): Node[] {
  if (!node || !node.Graph)
    throw treePreprocessBadState(
      'tree placement cannot move a node without graph ownership',
    );
  const g = node.Graph,
    seen = new Set([node]),
    stack: Node[] = [];
  const pushChildren = (parent: Node) => {
    if (!parent) return;
    const sequence = g.Sequences.get(parent);
    if (sequence)
      for (let i = sequence.Nodes.length - 1; i >= 0; i--) {
        guard.Step();
        stack.push(sequence.Nodes[i]!);
      }
    if (parent.IsClusterVessel()) {
      const cluster = g.Clusters.get(parent);
      if (cluster)
        for (let i = cluster.Nodes.length - 1; i >= 0; i--) {
          guard.Step();
          stack.push(cluster.Nodes[i]!);
        }
    }
    if (parent.IsContainer()) {
      const children = g.Containers.get(parent) ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        guard.Step();
        stack.push(children[i]!);
      }
    }
  };
  pushChildren(node);
  const descendants: Node[] = [];
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current)
      throw treePreprocessBadState(
        'tree placement encountered a nil graph descendant',
      );
    if (seen.has(current)) continue;
    seen.add(current);
    descendants.push(current);
    pushChildren(current);
  }
  return descendants;
}
export function moveTreeNodeWithChildren(
  node: Node,
  dx: number,
  dy: number,
  guard: WorkGuard,
): void {
  if (!node || !node.TopLeft)
    throw treePreprocessBadState(
      'tree placement cannot move an incomplete node',
    );
  if (dx === 0 && dy === 0) return guard.Check();
  const descendants = treePlacementDescendants(node, guard);
  guard.Step();
  node.Translate(dx, dy);
  guard.Finish();
  for (const child of descendants) {
    guard.Step();
    if (!child.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered a descendant without a position',
      );
    child.Translate(dx, dy);
    guard.Finish();
  }
}
export function moveTreeNodeAbsWithChildren(
  node: Node,
  x: number,
  y: number,
  guard: WorkGuard,
): void {
  if (!node || !node.TopLeft)
    throw treePreprocessBadState(
      'tree placement cannot move an incomplete node',
    );
  if (node.TopLeft.X === x && node.TopLeft.Y === y) return guard.Check();
  moveTreeNodeWithChildren(node, x - node.TopLeft.X, y - node.TopLeft.Y, guard);
}
export function offsetSubtree(
  t: Tree,
  x: number,
  y: number,
  guard: WorkGuard,
): void {
  const stack = [t],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current);
    moveTreeNodeWithChildren(current.Node, x, y, guard);
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
  guard.Finish();
}
export function swapDimensions(t: Tree, guard: WorkGuard): void {
  const stack = [t],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node || !current.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current);
    moveTreeNodeAbsWithChildren(
      current.Node,
      current.Node.TopLeft.Y,
      current.Node.TopLeft.X,
      guard,
    );
    [current.Node.Width, current.Node.Height] = [
      current.Node.Height,
      current.Node.Width,
    ];
    guard.Finish();
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
}
export function flip(t: Tree, guard: WorkGuard): void {
  const stack = [t],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node || !current.Node.TopLeft)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current);
    moveTreeNodeAbsWithChildren(
      current.Node,
      -(current.Node.TopLeft.X + current.Node.Width),
      -(current.Node.TopLeft.Y + current.Node.Height),
      guard,
    );
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
  guard.Finish();
}
export function setOrientation(
  t: Tree,
  o: Orientation,
  guard: WorkGuard,
): void {
  const stack = [t],
    seen = new Set<Tree>();
  while (stack.length) {
    guard.Step();
    const current = stack.pop()!;
    if (!current || !current.Node)
      throw treePreprocessBadState(
        'tree placement encountered an incomplete tree',
      );
    if (seen.has(current))
      throw treePreprocessBadState(
        'tree placement encountered a repeated tree node',
      );
    seen.add(current);
    current.Orientation = o;
    guard.Finish();
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      stack.push(current.Children[i]!);
    }
  }
}
