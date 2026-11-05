// Translated internal/placement/transpose.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { IsDiagonal } from '../geo/orientation.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { allReachableNodesGuarded } from '../layoutgraph/reachability.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { nearestSharedAncestor } from '../layoutgraph/placement-ancestry.js';
import { fixedOrigin } from '../layoutgraph/containment.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { NodeEdgeLength } from '../placementcost/edge-length.js';
import { rotateAround } from './rotation.js';
import { optimizeClusterFlip } from './cluster-flip.js';

export function transpose(
  ctx: Context,
  graph: Graph,
  node: Node,
  abductions: EdgeAbduction[] | null,
): boolean {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'TransposeTransactions');
  if (
    node.Hierarchy !== null ||
    graph.NodeToTree.has(node) ||
    graph.Trees.has(node) ||
    node.FixedTopLeft !== null
  )
    return false;
  for (const e of abductions ?? [])
    if (
      e.OriginallyFrom === node ||
      e.OriginallyTo === node ||
      e.CurrentFrom === node ||
      e.CurrentTo === node
    )
      return false;
  if (node.Edges.length !== 1 && node.Edges.length !== 2) return false;
  const guard = new WorkGuard(ctx, 'TransposeReachability', MaxEngineWorkUnits);
  const reachable = (
    start: Node,
    containers: boolean,
    ignore: (Node | null)[],
  ): Node[] =>
    allReachableNodesGuarded(
      start,
      containers,
      false,
      true,
      new Set(ignore.filter((n): n is Node => n !== null)),
      guard,
    );
  let transposeNodes: Node[], center: Node;
  const reachFromOwner = (other: Node, ancestor: Node | null): Node[] => {
    let current = node;
    while (current.container() !== ancestor) current = current.container()!;
    return reachable(current, false, [other]);
  };
  if (node.Edges.length === 1) {
    const a = node.Adjacent(node.Edges[0]!);
    if (
      isDescendantOf(a, node) ||
      isDescendantOf(node, a) ||
      IsDiagonal(nodeOrientation(node, a))
    )
      return false;
    const ancestor = nearestSharedAncestor(node, a);
    center = a;
    if (abductions === null) {
      transposeNodes = reachFromOwner(a, ancestor);
      if (transposeNodes.some((n) => isDescendantOf(a, n))) return false;
    } else transposeNodes = [node];
  } else {
    const a = node.Adjacent(node.Edges[0]!),
      b = node.Adjacent(node.Edges[1]!);
    if (
      isDescendantOf(a, node) ||
      isDescendantOf(node, a) ||
      isDescendantOf(b, node) ||
      isDescendantOf(node, b)
    )
      return false;
    const ancestorA = nearestSharedAncestor(node, a),
      ancestorB = nearestSharedAncestor(node, b);
    const connected = reachable(a, true, [node, ancestorA]);
    if (connected.includes(b)) return false;
    if (
      IsDiagonal(nodeOrientation(node, a)) ||
      IsDiagonal(nodeOrientation(node, b))
    )
      return false;
    const reachA = reachable(a, false, [node, ancestorA]),
      reachB = reachable(b, false, [node, ancestorB]);
    if (reachA.length >= reachB.length) {
      if (abductions === null) {
        transposeNodes = reachFromOwner(a, ancestorB);
        if (transposeNodes.some((n) => isDescendantOf(a, n))) return false;
      } else transposeNodes = [...reachB, node];
      center = a;
    } else {
      if (abductions === null) {
        transposeNodes = reachFromOwner(b, ancestorA);
        if (transposeNodes.some((n) => isDescendantOf(b, n))) return false;
      } else transposeNodes = [...reachA, node];
      center = b;
    }
  }
  guard.Finish();
  for (const n of transposeNodes) if (fixedOrigin(n) !== null) return false;
  const opts = {
    EdgeAbductions: abductions,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: true,
  };
  const calc = (): number => {
    if (abductions === null) return EdgeLength(ctx, graph, opts);
    let sum = NodeEdgeLength(ctx, node, opts);
    for (const e of node.Edges)
      sum += NodeEdgeLength(ctx, node.Adjacent(e), opts);
    return sum;
  };
  let bestLength = calc(),
    bestRotations = -1;
  const txn = NewTransaction(ctx, graph, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  const rotate = (times: number): void => {
    for (const n of transposeNodes) {
      rotateAround(n, graph, center, times, abductions !== null);
      if (n.isClusterVessel) optimizeClusterFlip(ctx, graph.Clusters.get(n)!);
    }
  };
  for (let i = 0; i < 3; i++) {
    txn.AddOp(() => rotate(i + 1));
    let committed = false;
    try {
      txn.Commit(ctx);
      committed = true;
    } catch (error) {
      if (!IsCandidateRejection(error)) throw error;
    }
    if (committed) {
      let length: number;
      try {
        length = calc();
      } catch (error) {
        txn.Rollback();
        txn.Clear();
        throw error;
      }
      if (PrecisionCompare(length, bestLength, PRECISION) < 0) {
        bestLength = length;
        bestRotations = i + 1;
      }
    }
    txn.Rollback();
    txn.Clear();
  }
  if (bestRotations !== -1) {
    txn.AddOp(() => rotate(bestRotations));
    txn.Commit(ctx);
    return true;
  }
  return false;
}
