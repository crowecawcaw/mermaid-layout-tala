// Translated only-flip path from internal/placement/cluster_optimization.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Cluster } from '../layoutgraph/records.js';
import type { Graph } from '../layoutgraph/graph.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import {
  EdgeLengthCacheEntries,
  SnapshotPlacementCosts,
  type PlacementCostSnapshot,
} from '../layoutgraph/placement-cost.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import { ClusterRDFSOrder } from '../layoutgraph/edge-abduction.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { alignConnectedNodes, alignVessel } from './cluster-alignment.js';
import { reduceGapToNeighbors } from './gap-reduction.js';
import { axisForArrangement, TraversalDirection } from './axis.js';
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
  type Transaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { PaddingBetween } from '../grouping/clusters.js';
import { clusterExternalConnectedNodes } from './cluster-connections.js';

class OptimizeClustersRollback {
  state: GraphState | null = null;
  desired: {
    cluster: Cluster;
    arrangement: Cluster['DesiredArrangement'];
  } | null = null;
  costs: PlacementCostSnapshot | null = null;
  readonly cellSize: number;
  constructor(readonly graph: Graph) {
    this.cellSize = graph.CellSize;
  }
  recordDesired(
    cluster: Cluster,
    arrangement: Cluster['DesiredArrangement'],
  ): void {
    if (
      !this.state &&
      !this.desired &&
      cluster.DesiredArrangement !== arrangement
    )
      this.desired = { cluster, arrangement: cluster.DesiredArrangement };
  }
  recordState(txn: Transaction): boolean {
    if (this.state) return false;
    this.state = txn.PriorGraphState;
    return true;
  }
  captureCosts(guard: import('../limits/work.js').WorkGuard): void {
    if (this.costs) return;
    const count = EdgeLengthCacheEntries(this.graph);
    if (count > maxEngineTopologyReferences)
      throw new Error(
        `TALA OptimizeClustersTransactions edge-length cache entries exceed limit ${maxEngineTopologyReferences}`,
      );
    for (let i = 0; i < count; i++) guard.Step();
    const costs = SnapshotPlacementCosts(this.graph);
    guard.Finish();
    this.costs = costs;
  }
  restore(): void {
    if (this.state) RollbackGraphState(this.graph, this.state);
    if (this.desired)
      this.desired.cluster.DesiredArrangement = this.desired.arrangement;
    this.graph.CellSize = this.cellSize;
    this.costs?.Restore();
  }
}
export function optimizeClusterFlip(ctx: Context, cluster: Cluster): boolean {
  return optimizeCluster(ctx, cluster, true, null);
}
function optimizeCluster(
  ctx: Context,
  cluster: Cluster,
  onlyFlip: boolean,
  rollback: OptimizeClustersRollback | null,
): boolean {
  const [txnContext, guard] = EnsureTransactionWorkGuard(
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
  rollback?.recordDesired(cluster, desired);
  cluster.DesiredArrangement = desired;
  const graph = cluster.Graph!;
  let txn: Transaction | null = null,
    ownsRollbackState = false,
    changed = false;
  if (cluster.Arrangement !== desired) {
    txn = NewTransaction(txnContext, graph, {
      AffectContainers: true,
      IgnoreContainerEscape: false,
      AffectEdgeRoutes: false,
    });
    if (rollback) ownsRollbackState = rollback.recordState(txn);
    let tryCenter = true;
    txn.AddOp(() => {
      if (cluster.Arrangement === 'Column') cluster.Arrangement = 'Row';
      else if (cluster.Arrangement === 'Row') cluster.Arrangement = 'Column';
      cluster.Padding = PaddingBetween(cluster, true);
      clusterSyncGeometryWithWork(cluster, unmeteredGroupGeometry);
      if (tryCenter) {
        const original = txn!.PriorGraphState.nodeGeometry.get(
          cluster.Vessel!,
        )!;
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
    changed = true;
  }
  if (!onlyFlip && cluster.Arrangement === desired) {
    if (!txn) {
      txn = NewTransaction(txnContext, graph, {
        AffectContainers: true,
        IgnoreContainerEscape: false,
        AffectEdgeRoutes: false,
      });
      if (rollback) ownsRollbackState = rollback.recordState(txn);
    }
    rollback?.captureCosts(guard);
    const opts = {
      EdgeAbductions: null,
      IncludeNodeSizes: true,
      EnforceMinimumGap: false,
      PenalizeDirection: true,
    };
    let bestLength = EdgeLength(txnContext, graph, opts),
      moveVessel = false,
      moveNodes = false;
    const vesselMove = (): void => {
      if (cluster.Arrangement === 'Column') alignVessel(cluster, false);
      else if (cluster.Arrangement === 'Row') alignVessel(cluster, true);
    };
    const nodesMove = (): void => {
      if (cluster.Arrangement === 'Column') alignConnectedNodes(cluster, false);
      else if (cluster.Arrangement === 'Row')
        alignConnectedNodes(cluster, true);
    };
    txn.AddOp(vesselMove);
    let committed = true;
    try {
      txn.Commit(txnContext);
    } catch (e) {
      if (!IsCandidateRejection(e)) throw e;
      committed = false;
    }
    if (committed) {
      let length: number;
      try {
        length = EdgeLength(txnContext, graph, opts);
      } catch (e) {
        txn.Rollback();
        txn.Clear();
        throw e;
      }
      if (PrecisionCompare(length, bestLength, PRECISION) < 0) {
        bestLength = length;
        moveVessel = true;
      }
    }
    txn.Rollback();
    txn.Clear();
    txn.AddOp(nodesMove);
    committed = true;
    try {
      txn.Commit(txnContext);
    } catch (e) {
      if (!IsCandidateRejection(e)) throw e;
      committed = false;
    }
    if (committed) {
      let length: number;
      try {
        length = EdgeLength(txnContext, graph, opts);
      } catch (e) {
        txn.Rollback();
        txn.Clear();
        throw e;
      }
      if (PrecisionCompare(length, bestLength, PRECISION) < 0) moveNodes = true;
    }
    txn.Rollback();
    txn.Clear();
    if (moveNodes || moveVessel) {
      txn.AddOp(moveNodes ? nodesMove : vesselMove);
      txn.Commit(txnContext);
      changed = true;
      txn.Clear();
      if (ownsRollbackState) txn = txn.CloneGeometryContext();
      txn.UpdateState();
      txn.AddOp(() => {
        reduceGapToNeighbors(txnContext, cluster.Vessel!, null, {
          axis: axisForArrangement(cluster.Arrangement),
          direction: TraversalDirection.Forward,
          attemptRecoverSymmetry: true,
        });
      });
      try {
        txn.Commit(txnContext);
      } catch (e) {
        if (!IsCandidateRejection(e)) throw e;
      }
    }
  }
  return changed;
}
export function OptimizeClusters(ctx: Context, graph: Graph): boolean {
  [ctx] = EnsureTransactionWorkGuard(ctx, 'OptimizeClustersTransactions');
  const order = ClusterRDFSOrder(graph);
  if (order.length === 0) return false;
  const rollback = new OptimizeClustersRollback(graph);
  let complete = false;
  try {
    let changed = false;
    for (const vessel of order)
      if (optimizeCluster(ctx, graph.Clusters.get(vessel)!, false, rollback))
        changed = true;
    complete = true;
    return changed;
  } finally {
    if (!complete) rollback.restore();
  }
}
