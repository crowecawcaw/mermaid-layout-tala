// Translated internal/placement/equidistance.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Round, PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { IsVertical, IsHorizontal } from '../geo/orientation.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { allReachableNodesGuarded } from '../layoutgraph/reachability.js';
import { nearestSharedAncestor } from '../layoutgraph/placement-ancestry.js';
import { moveNodeWithChildren } from '../layoutgraph/containment.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { snapshotNodePositionsContext, restoreNodePositions } from './types.js';
const options = {
  EdgeAbductions: null,
  IncludeNodeSizes: true,
  EnforceMinimumGap: false,
  PenalizeDirection: true,
};
export function equidistanceNodeGuarded(
  ctx: Context,
  original: Node,
  g: Graph,
  horizontal: boolean,
  guard: WorkGuard,
): boolean {
  const error = ctx.Err();
  if (error) throw error;
  if (
    original.Hierarchy ||
    g.NodeToTree.has(original) ||
    g.Trees.has(original) ||
    original.FixedTopLeft
  )
    return false;
  let n = original,
    back: Node | null = null,
    front: Node | null = null;
  for (const edge of n.Edges) {
    const adjacent = n.Adjacent(edge);
    if (isDescendantOf(n, adjacent) || isDescendantOf(adjacent, n))
      return false;
    if (horizontal) {
      if (
        adjacent.TopLeft!.X + adjacent.Width < n.TopLeft!.X &&
        (!back ||
          adjacent.TopLeft!.X + adjacent.Width > back.TopLeft!.X + back.Width)
      )
        back = adjacent;
      if (
        adjacent.TopLeft!.X > n.TopLeft!.X + n.Width &&
        (!front || adjacent.TopLeft!.X < front.TopLeft!.X)
      )
        front = adjacent;
    } else {
      if (
        adjacent.TopLeft!.Y + adjacent.Height < n.TopLeft!.Y &&
        (!back ||
          adjacent.TopLeft!.Y + adjacent.Height > back.TopLeft!.Y + back.Height)
      )
        back = adjacent;
      if (
        adjacent.TopLeft!.Y > n.TopLeft!.Y + n.Height &&
        (!front || adjacent.TopLeft!.Y < front.TopLeft!.Y)
      )
        front = adjacent;
    }
  }
  if (!back || !front) return false;
  let backNode: Node = back,
    frontNode: Node = front;
  let connected: Node[] = [];
  for (const edge of n.Edges) {
    const adjacent = n.Adjacent(edge);
    if (adjacent === backNode || adjacent === frontNode) continue;
    if (
      horizontal
        ? !IsVertical(nodeOrientation(adjacent, n))
        : !IsHorizontal(nodeOrientation(adjacent, n))
    )
      continue;
    if (
      isDescendantOf(adjacent, backNode) ||
      isDescendantOf(backNode, adjacent) ||
      isDescendantOf(adjacent, frontNode) ||
      isDescendantOf(frontNode, adjacent)
    )
      continue;
    const reachable = allReachableNodesGuarded(
      adjacent,
      false,
      true,
      true,
      new Set([n, backNode, frontNode]),
      guard,
    );
    for (const r of reachable) {
      if (isDescendantOf(n, r)) continue;
      if (isDescendantOf(r, backNode) || isDescendantOf(backNode, r)) continue;
      if (isDescendantOf(r, frontNode) || isDescendantOf(frontNode, r))
        continue;
    }
    for (const r of reachable) if (!connected.includes(r)) connected.push(r);
  }
  if (connected.some((c) => c.FixedTopLeft !== null)) connected = [];
  const ancestorBack = nearestSharedAncestor(n, backNode),
    ancestorFront = nearestSharedAncestor(n, frontNode);
  while (
    n.container() !== null &&
    !isDescendantOf(backNode, n.container()) &&
    !isDescendantOf(frontNode, n.container())
  )
    n = n.container()!;
  while (backNode.container() !== ancestorBack) {
    const container = backNode.container()!;
    if (
      horizontal
        ? container.TopLeft!.X + container.Width < n.TopLeft!.X
        : container.TopLeft!.Y + container.Height < n.TopLeft!.Y
    )
      backNode = container;
    else break;
  }
  while (frontNode.container() !== ancestorFront) {
    const container = frontNode.container()!;
    if (
      horizontal
        ? container.TopLeft!.X > n.TopLeft!.X + n.Width
        : container.TopLeft!.Y > n.TopLeft!.Y + n.Height
    )
      frontNode = container;
    else break;
  }
  const before = EdgeLength(ctx, g, options);
  let dx = 0,
    dy = 0;
  if (horizontal)
    dx =
      Round(
        (backNode.TopLeft!.X + backNode.Width + frontNode.TopLeft!.X) / 2 -
          n.Width / 2,
      ) - n.TopLeft!.X;
  else
    dy =
      Round(
        (backNode.TopLeft!.Y + backNode.Height + frontNode.TopLeft!.Y) / 2 -
          n.Height / 2,
      ) - n.TopLeft!.Y;
  const txn = NewTransaction(ctx, g, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  let solo = 0,
    withConnected = 0;
  const attempt = (withOthers: boolean): number => {
    txn.AddOp(() => {
      if (withOthers)
        for (const node of [...connected, n])
          moveNodeWithChildren(node, dx, dy);
      else moveNodeWithChildren(n, dx, dy);
    });
    let rolledBack = false;
    try {
      txn.Commit(ctx);
    } catch (error) {
      if (!IsCandidateRejection(error)) throw error;
      rolledBack = true;
    }
    let value = 0;
    if (!rolledBack) {
      let length: number;
      try {
        length = EdgeLength(ctx, g, options);
      } catch (error) {
        txn.Rollback();
        throw error;
      }
      if (PrecisionCompare(length, before, PRECISION) <= 0) value = length;
      txn.Rollback();
    }
    txn.Clear();
    return value;
  };
  solo = attempt(false);
  if (connected.length) withConnected = attempt(true);
  if (solo === 0 && withConnected === 0) return false;
  txn.AddOp(() => {
    if (solo === 0 && withConnected > 0)
      for (const node of [...connected, n]) moveNodeWithChildren(node, dx, dy);
    else if (
      (solo > 0 && withConnected === 0) ||
      PrecisionCompare(solo, withConnected, PRECISION) < 0
    )
      moveNodeWithChildren(n, dx, dy);
    else
      for (const node of [...connected, n]) moveNodeWithChildren(node, dx, dy);
  });
  txn.Commit(ctx);
  return true;
}
export function Equidistance(ctx: Context, g: Graph): boolean {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'EquidistanceTransactions');
  validateEngineGraph(ctx, 'Equidistance', g);
  const positions = snapshotNodePositionsContext(ctx, 'Equidistance', g.Nodes),
    guard = new WorkGuard(ctx, 'EquidistanceReachability', MaxEngineWorkUnits);
  let complete = false;
  try {
    let h = false,
      v = false;
    for (const node of g.Nodes) {
      const hm = equidistanceNodeGuarded(ctx, node, g, true, guard),
        vm = equidistanceNodeGuarded(ctx, node, g, false, guard);
      if (hm) h = true;
      if (vm) v = true;
    }
    if (h) {
      for (let i = 0; i < 5; i++) {
        let again = false;
        for (const node of g.Nodes)
          if (equidistanceNodeGuarded(ctx, node, g, true, guard)) again = true;
        if (!again) break;
      }
    }
    if (v) {
      for (let i = 0; i < 5; i++) {
        let again = false;
        for (const node of g.Nodes)
          if (equidistanceNodeGuarded(ctx, node, g, false, guard)) again = true;
        if (!again) break;
      }
    }
    guard.Finish();
    complete = true;
    return h || v;
  } finally {
    if (!complete) restoreNodePositions(positions);
  }
}
