// Translated orientation construction from internal/trees/layout.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Orientation } from '../geo/orientation.js';
import type { Tree } from '../layoutgraph/records.js';
import type { WorkGuard } from '../limits/work.js';
import {
  flip,
  swapDimensions,
  setOrientation,
  layoutTree,
  centerAlignChildren,
} from './geometry.js';
export function invertOrientationToBottom(
  t: Tree,
  orientation: Orientation,
  guard: WorkGuard,
): void {
  switch (orientation) {
    case Orientation.Top:
      return flip(t, guard);
    case Orientation.Right:
      return swapDimensions(t, guard);
    case Orientation.Left:
      swapDimensions(t, guard);
      return flip(t, guard);
  }
  guard.Check();
}
export function constructToOrientation(
  tree: Tree,
  orientation: Orientation,
  guard: WorkGuard,
): void {
  setOrientation(tree, orientation, guard);
  invertOrientationToBottom(tree, orientation, guard);
  layoutTree(tree, guard);
  centerAlignChildren(tree, guard);
  invertOrientationToBottom(tree, orientation, guard);
}

import { validateBottomOrientation, positionEdgeLabels } from './geometry.js';
export function positionTreeEdgeLabels(
  tree: Tree,
  isolated: boolean,
  guard: WorkGuard,
): void {
  const orientation = tree.Orientation;
  invertOrientationToBottom(tree, orientation, guard);
  let failed = false;
  try {
    const labelTrees: Tree[] = [];
    for (const root of tree.Children) {
      guard.Step();
      if (isolated) labelTrees.push(root);
      else
        for (const child of root.Children) {
          guard.Step();
          labelTrees.push(child);
        }
    }
    for (const t of labelTrees) {
      guard.Step();
      validateBottomOrientation(t, guard);
    }
    for (const t of labelTrees) {
      guard.Step();
      positionEdgeLabels(t, guard);
    }
    guard.Finish();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      invertOrientationToBottom(tree, orientation, guard);
    } catch (restoreError) {
      if (!failed) throw restoreError;
    }
  }
}
