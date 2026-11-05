// Translated only-flip path from internal/placement/cluster_optimization.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Cluster } from '../layoutgraph/records.js';
import { Orientation as O } from '../geo/orientation.js';
import { Round } from '../geo/math.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { moveNodeWithChildren } from '../layoutgraph/containment.js';
import {
  clusterSyncGeometryWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import {
  containerPadding,
  fitToBoundingBox,
  fixedBounds,
  positionContainerChildren,
} from '../layoutgraph/node-geometry.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { PaddingBetween } from '../grouping/clusters.js';
import { clusterExternalConnectedNodes } from './cluster-connections.js';

export function optimizeClusterFlip(ctx: Context, cluster: Cluster): boolean {
  const [txnContext] = EnsureTransactionWorkGuard(
    ctx,
    'OptimizeClusterTransactions',
  );
  let horizontal = 0,
    vertical = 0;
  for (const external of clusterExternalConnectedNodes(cluster)) {
    const orientation = nodeOrientation(cluster.Vessel!, external);
    switch (orientation) {
      case O.NONE:
        break;
      case O.Left:
      case O.Right:
        horizontal++;
        break;
      case O.Top:
      case O.Bottom:
        vertical++;
        break;
      default: {
        const x = Math.abs(external.Center().X - cluster.Vessel!.Center().X),
          y = Math.abs(external.Center().Y - cluster.Vessel!.Center().Y);
        if (x > y) horizontal++;
        else if (y > x) vertical++;
      }
    }
  }
  let desired = cluster.DesiredArrangement;
  if (vertical > horizontal) desired = 'Row';
  else if (horizontal > vertical) desired = 'Column';
  cluster.DesiredArrangement = desired;
  if (cluster.Arrangement === desired) return false;
  const graph = cluster.Graph!,
    txn = NewTransaction(txnContext, graph, {
      AffectContainers: true,
      IgnoreContainerEscape: false,
      AffectEdgeRoutes: false,
    });
  let tryCenter = true;
  txn.AddOp(() => {
    if (cluster.Arrangement === 'Column') cluster.Arrangement = 'Row';
    else if (cluster.Arrangement === 'Row') cluster.Arrangement = 'Column';
    cluster.Padding = PaddingBetween(cluster, true);
    clusterSyncGeometryWithWork(cluster, unmeteredGroupGeometry);
    if (tryCenter) {
      const original = txn.PriorGraphState.nodeGeometry.get(cluster.Vessel!)!;
      if (cluster.Arrangement === 'Column')
        moveNodeWithChildren(
          cluster.Vessel!,
          0,
          Round((original.height - cluster.Vessel!.Height) / 2),
        );
      else if (cluster.Arrangement === 'Row')
        moveNodeWithChildren(
          cluster.Vessel!,
          Round((original.width - cluster.Vessel!.Width) / 2),
          0,
        );
    }
    if (cluster.Container !== null && cluster.Container.TopLeft !== null) {
      const [tl, br] = fixedBounds(
        graph.Containers.get(cluster.Container) ?? [],
      );
      const padding = containerPadding(graph, cluster.Container, false);
      fitToBoundingBox(cluster.Container, tl!, br!, padding);
      positionContainerChildren(cluster.Container, true);
    }
  });
  try {
    txn.Commit(txnContext);
  } catch (error) {
    if (!IsCandidateRejection(error)) throw error;
    tryCenter = false;
    try {
      txn.Commit(txnContext);
    } catch (second) {
      if (!IsCandidateRejection(second)) throw second;
      return false;
    }
  }
  txn.UpdateState();
  txn.Clear();
  return true;
}
