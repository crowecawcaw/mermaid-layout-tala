// Translated from internal/layoutgraph/graph.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { GraphState } from './graph-state.js';
import type { Point } from '../geo/point.js';
import { New as invariant } from '../invariant/errors.js';
import { Surrounds } from './node-spatial.js';
import { deltaToGuarded } from './node-spacing.js';
import {
  isPointPastFixedOrigin,
  allDescendantNodesGuarded,
  ancestorsOfGuarded,
} from './containment.js';
export interface WorkStepper {
  Step(): void;
  Finish(): void;
}
export function isStructurallyBadStateWithFixedOriginContext(
  g: Graph,
  node: Node,
  state: GraphState | null,
  ignoreContainerEscape: boolean,
  fixedOrigin: Point | null,
  fixedOriginCached: boolean,
  guard: WorkStepper,
): [boolean, boolean] {
  if (node === null || node.TopLeft === null)
    throw invariant('transaction bad-state check received an incomplete node');
  guard.Step();
  if (node.Cluster !== null) return [false, true];
  if (!ignoreContainerEscape) {
    const c = node.container();
    if (
      c !== null &&
      c.TopLeft !== null &&
      node.TopLeft !== null &&
      !Surrounds(c, node, 0)
    )
      return [true, false];
    if (node.isContainer)
      for (const child of g.Containers.get(node) ?? []) {
        guard.Step();
        if (child === null || child.TopLeft === null)
          throw invariant('transaction container has an incomplete child');
        if (!Surrounds(node, child, 0)) return [true, false];
      }
  }
  const pastFixedOrigin = fixedOriginCached
    ? fixedOrigin !== null &&
      (node.TopLeft.X < fixedOrigin.X || node.TopLeft.Y < fixedOrigin.Y)
    : isPointPastFixedOrigin(node, node.TopLeft.X, node.TopLeft.Y, true);
  if (pastFixedOrigin) return [true, false];
  if (node.FixedTopLeft !== null && state !== null) {
    const original = state.nodeGeometry.get(node),
      point = original?.topLeft.pointer
        ? original.topLeft.value!
        : { X: 0, Y: 0 };
    if (node.TopLeft.X !== point.X || node.TopLeft.Y !== point.Y)
      return [true, false];
  }
  return [false, false];
}
export function doesOverlapWithDimensionsContext(
  g: Graph,
  node: Node,
  p: Point,
  newWidth: number,
  newHeight: number,
  exceptions: Node[],
  pairwiseExceptions: Map<Node, Set<Node>> | null,
  guard: WorkStepper,
): boolean {
  if (node === null || p === null)
    throw invariant('overlap check received an incomplete node');
  const right = p.X + newWidth,
    bottom = p.Y + newHeight,
    exceptionSet = new Set<Node>();
  for (const exception of exceptions) {
    guard.Step();
    exceptionSet.add(exception);
  }
  const pairwiseNodeExceptions = pairwiseExceptions?.get(node);
  for (const other of g.Nodes) {
    guard.Step();
    if (other === null)
      throw invariant('overlap check encountered a nil graph node');
    if (other === node) continue;
    if (other.TopLeft !== null) {
      if (
        p.X > other.TopLeft.X + other.Width + 500 ||
        p.X + newWidth + 500 < other.TopLeft.X ||
        p.Y > other.TopLeft.Y + other.Height + 500 ||
        p.Y + newHeight + 500 < other.TopLeft.Y
      )
        continue;
      if (pairwiseNodeExceptions?.has(other) || exceptionSet.has(other))
        continue;
      const delta = deltaToGuarded(node, other, p, guard);
      if (
        p.X < other.TopLeft.X + other.Width + delta &&
        right + delta > other.TopLeft.X &&
        p.Y < other.TopLeft.Y + other.Height + delta &&
        bottom + delta > other.TopLeft.Y
      )
        return true;
    }
  }
  guard.Finish();
  return false;
}
export function hasBadOverlapStateContext(
  g: Graph,
  node: Node,
  state: GraphState | null,
  guard: WorkStepper,
): boolean {
  if (node === null || node.TopLeft === null)
    throw invariant('transaction overlap check received an incomplete node');
  if (node.Cluster !== null) return false;
  let exceptions: Node[] = [];
  if (node.isContainer || node.isClusterVessel || g.Sequences.get(node) != null)
    exceptions = allDescendantNodesGuarded(g, node, true, guard);
  if (
    node.Container !== null ||
    node.Cluster !== null ||
    node.Sequence !== null
  )
    exceptions.push(...ancestorsOfGuarded(node, guard));
  return doesOverlapWithDimensionsContext(
    g,
    node,
    node.TopLeft,
    node.Width,
    node.Height,
    exceptions,
    state?.existingOverlaps ?? null,
    guard,
  );
}
export function isBadStateContext(
  g: Graph,
  node: Node,
  state: GraphState | null,
  ignoreContainerEscape: boolean,
  guard: WorkStepper,
): boolean {
  const [bad, skip] = isStructurallyBadStateWithFixedOriginContext(
    g,
    node,
    state,
    ignoreContainerEscape,
    null,
    false,
    guard,
  );
  if (bad) return true;
  if (skip) {
    guard.Finish();
    return false;
  }
  return hasBadOverlapStateContext(g, node, state, guard);
}
