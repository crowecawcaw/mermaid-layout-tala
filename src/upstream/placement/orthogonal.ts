// Translated internal/placement/node_placement.go and internal/layoutgraph/graph.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Box } from '../geo/box.js';
import {
  positionContainerChildren,
  containerPadding,
} from '../layoutgraph/node-geometry.js';
import {
  moveNodeWithChildren,
  moveNodeAbsWithChildren,
} from '../layoutgraph/containment.js';
import {
  clusterSyncGeometryWithWork,
  sequenceSyncGeometryWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { SyncHerdFences } from '../proximity/herding.js';
import { JoinDistancedClusters } from '../grouping/join.js';
import { LayoutAxis, oppositeAxis } from './axis.js';
import { nodePlacementIterations, compactionFactor } from './tuning.js';
import { roundToPreviousCellSize } from './types.js';
import { initializeNodes } from './initialize.js';
import { initializeByGraphDistance } from './stress-initialize.js';
import { validateCellSize, validateGridAlignment } from './child-order.js';
import { compaction } from './compaction.js';
import {
  SizelessOptimizer,
  type OptimizerRandom,
} from './sizeless-optimizer.js';
import { SizedOptimizer } from './sized-optimizer.js';
export function syncNestedGeometry(graph: Graph): void {
  for (const node of graph.Nodes) {
    if (node.isContainer) positionContainerChildren(node, true);
    if (node.isClusterVessel) {
      const cluster = graph.Clusters.get(node)!;
      clusterSyncGeometryWithWork(cluster, unmeteredGroupGeometry);
      for (const member of cluster.Nodes)
        if (member.isContainer) {
          const padding = containerPadding(graph, member, true);
          for (const child of graph.Containers.get(member) ?? [])
            moveNodeWithChildren(child, padding.left, padding.top);
        }
    }
    const sequence = graph.Sequences.get(node);
    if (sequence !== undefined)
      sequenceSyncGeometryWithWork(sequence, unmeteredGroupGeometry);
  }
}
export function placeNodesOrthogonally(
  ctx: Context,
  root: Node | null,
  graph: Graph,
  abductions: EdgeAbduction[] | null,
  random: OptimizerRandom,
  obstacles: Box[],
  seed?: bigint,
): void {
  const fixed = graph.Nodes.filter((n) => n.FixedTopLeft !== null);
  let initialized = false;
  if (seed !== undefined && seed % 2n === 0n)
    initialized = initializeByGraphDistance(ctx, graph);
  if (!initialized) initializeNodes(ctx, graph);
  syncNestedGeometry(graph);
  const iterations = Math.trunc(
    nodePlacementIterations * Math.sqrt(graph.Nodes.length),
  );
  let temp = 2 * Math.sqrt(graph.Nodes.length);
  const cooling = Math.pow(0.2 / temp, 1 / iterations);
  let axis = LayoutAxis.Horizontal;
  const compactionIteration = 9;
  const sizeless = new SizelessOptimizer(ctx, graph, random);
  for (let i = 0; i < Math.floor(iterations / 2); i++) {
    const error = ctx.Err();
    if (error !== null)
      throw new Error(`PlaceNodes: ${error.message}`, { cause: error });
    sizeless.optimize(ctx, temp);
    if (i % compactionIteration === 0) {
      compaction(ctx, graph, {
        edgeAbductions: null,
        axis,
        includeSizes: false,
        factor: compactionFactor,
        transition: false,
        moveWorkLimit: 0n,
      });
      axis = oppositeAxis(axis);
      sizeless.resetOccupied();
    }
    temp = temp * cooling;
  }
  for (const current of [LayoutAxis.Horizontal, LayoutAxis.Vertical])
    compaction(ctx, graph, {
      edgeAbductions: abductions,
      axis: current,
      includeSizes: true,
      factor: compactionFactor,
      transition: true,
      moveWorkLimit: 0n,
    });
  if (fixed.length > 0) {
    const dx = fixed[0]!.FixedTopLeft!.X - fixed[0]!.TopLeft!.X,
      dy = fixed[0]!.FixedTopLeft!.Y - fixed[0]!.TopLeft!.Y;
    for (const n of graph.Nodes) moveNodeWithChildren(n, dx, dy);
    for (const n of fixed)
      moveNodeAbsWithChildren(n, n.FixedTopLeft!.X, n.FixedTopLeft!.Y);
  }
  validateCellSize(graph);
  for (const n of graph.Nodes) {
    if (n.FixedTopLeft !== null) continue;
    let x = n.TopLeft!.X,
      y = n.TopLeft!.Y;
    if (x % graph.CellSize !== 0)
      x = roundToPreviousCellSize(x, graph.CellSize);
    if (y % graph.CellSize !== 0)
      y = roundToPreviousCellSize(y, graph.CellSize);
    if (x !== n.TopLeft!.X || y !== n.TopLeft!.Y)
      moveNodeAbsWithChildren(n, x, y);
  }
  validateGridAlignment(graph);
  TurnCost(graph);
  graph.turnCost /= 2;
  const sized = new SizedOptimizer(
    ctx,
    graph,
    root,
    abductions,
    random,
    obstacles,
  );
  SyncHerdFences(graph);
  for (let i = Math.floor(iterations / 2) + 1; i < iterations; i++) {
    const error = ctx.Err();
    if (error !== null)
      throw new Error(`PlaceNodes: ${error.message}`, { cause: error });
    sized.optimize(ctx, temp);
    if (i % compactionIteration === 0) {
      const factor = Math.max(
        1,
        1 + (2 * (iterations - i - 30)) / (0.5 * iterations),
      );
      compaction(ctx, graph, {
        edgeAbductions: abductions,
        axis,
        includeSizes: true,
        factor,
        transition: false,
        moveWorkLimit: 0n,
      });
      axis = oppositeAxis(axis);
      JoinDistancedClusters(ctx, graph);
      SyncHerdFences(graph);
    }
    temp = temp * cooling;
  }
  JoinDistancedClusters(ctx, graph);
  SyncHerdFences(graph);
  for (let i = 0; i < 10; i++) if (!sized.optimize(ctx, 0)) break;
  if (fixed.length > 0) {
    const dx = fixed[0]!.FixedTopLeft!.X - fixed[0]!.TopLeft!.X,
      dy = fixed[0]!.FixedTopLeft!.Y - fixed[0]!.TopLeft!.Y;
    for (const n of graph.Nodes) moveNodeWithChildren(n, dx, dy);
    for (const n of fixed) n.TopLeft = n.FixedTopLeft!.Copy();
  }
}
