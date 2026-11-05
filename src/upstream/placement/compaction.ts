// Translated internal/placement/compaction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../limits/optimization.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { ConnectedNodeGap } from '../layoutgraph/geometry-policy.js';
import { deltaToGuarded } from '../layoutgraph/node-spacing.js';
import { doesOverlapAt } from '../layoutgraph/node-spatial.js';
import {
  isPointPastFixedOrigin,
  moveNodeAbsWithChildren,
  moveNodeWithChildren,
} from '../layoutgraph/containment.js';
import { NodesEdgeLength } from '../placementcost/edge-length.js';
import { NodesSymmetry } from '../placementcost/symmetry.js';
import { Slice } from '../gosort/slice.js';
import { LayoutAxis, axisValid, axisIsHorizontal } from './axis.js';
import {
  roundToPreviousCellSize,
  snapshotNodePositionsContext,
  restoreNodePositions,
} from './types.js';
import {
  orderedAlongAxis,
  nearestFrom,
  globallyFurthestBehind,
  compactionFloor,
  candidateMoves,
  visibilityEdges,
} from './compaction-geometry.js';
import { moveNodeToBest } from './moves.js';
export interface CompactionOptions {
  edgeAbductions: EdgeAbduction[] | null;
  axis: LayoutAxis;
  includeSizes: boolean;
  factor: number;
  transition: boolean;
  moveWorkLimit: bigint;
}
export function inflateAlongAxis(
  graph: Graph,
  horizontal: boolean,
  includeSizes: boolean,
  factor: number,
  edges: Edge[],
  transition: boolean,
): void {
  const ordered = orderedAlongAxis(graph, horizontal),
    hasFixed = graph.Nodes.some((n) => n.FixedTopLeft !== null);
  for (const node of ordered) {
    const nearest = nearestFrom(edges, node, horizontal, includeSizes);
    if (nearest === null) {
      if (hasFixed && transition && node.FixedTopLeft === null) {
        if (horizontal)
          moveNodeAbsWithChildren(
            node,
            roundToPreviousCellSize(node.TopLeft!.X, graph.CellSize),
            node.TopLeft!.Y,
          );
        else
          moveNodeAbsWithChildren(
            node,
            node.TopLeft!.X,
            roundToPreviousCellSize(node.TopLeft!.Y, graph.CellSize),
          );
      }
      continue;
    }
    if (node.FixedTopLeft !== null && !transition) continue;
    const delta = transition
        ? ConnectedNodeGap
        : deltaToGuarded(node, nearest, node.TopLeft, null),
      floor = compactionFloor(
        graph,
        nearest,
        factor,
        horizontal,
        includeSizes,
        delta,
      );
    if (horizontal) {
      const value = includeSizes ? floor * graph.CellSize : floor;
      if (value > node.TopLeft!.X)
        moveNodeAbsWithChildren(node, value, node.TopLeft!.Y);
    } else {
      const value = includeSizes ? floor * graph.CellSize : floor;
      if (value > node.TopLeft!.Y)
        moveNodeAbsWithChildren(node, node.TopLeft!.X, value);
    }
  }
}
export function compactAlongAxis(
  ctx: Context,
  graph: Graph,
  horizontal: boolean,
  includeSizes: boolean,
  factor: number,
  abductions: EdgeAbduction[] | null,
  edges: Edge[],
  guard: OptimizationWorkGuard,
): boolean {
  let changed = false;
  for (const node of orderedAlongAxis(graph, horizontal)) {
    if (node.FixedTopLeft !== null) continue;
    const points = candidateMoves(
      ctx,
      graph,
      node,
      factor,
      horizontal,
      includeSizes,
      0,
      edges,
    );
    points.push(node.TopLeft!.Copy());
    if (
      moveNodeToBest(ctx, graph, node, points, abductions, includeSizes, guard)
    )
      changed = true;
  }
  return changed;
}
export function shiftSubgraphs(
  ctx: Context,
  graph: Graph,
  horizontal: boolean,
  includeSizes: boolean,
  factor: number,
  abductions: EdgeAbduction[] | null,
  edges: Edge[],
): boolean {
  let changed = false;
  const subgraphs = new Map<Node, Node[]>(),
    roots: Node[] = [];
  for (const node of orderedAlongAxis(graph, horizontal)) {
    const nearest = nearestFrom(edges, node, horizontal, includeSizes);
    if (nearest === null) {
      subgraphs.set(node, [node]);
      roots.push(node);
    } else {
      const list = subgraphs.get(nearest) ?? [];
      list.push(node);
      subgraphs.set(nearest, list);
    }
  }
  const filtered = roots.filter((root) => {
    if (subgraphs.get(root)!.some((n) => n.FixedTopLeft !== null)) {
      subgraphs.delete(root);
      return false;
    }
    return true;
  });
  const fixed = graph.Nodes.filter((n) => n.FixedTopLeft !== null);
  Slice(filtered, (a, b) => {
    const x = horizontal ? a.TopLeft!.X : a.TopLeft!.Y,
      y = horizontal ? b.TopLeft!.X : b.TopLeft!.Y;
    return x === y ? a.ID < b.ID : x < y;
  });
  const global = globallyFurthestBehind(graph, horizontal);
  for (const root of filtered) {
    const subgraph = subgraphs.get(root)!,
      same = horizontal
        ? root.TopLeft!.X === global.TopLeft!.X
        : root.TopLeft!.Y === global.TopLeft!.Y;
    const possible = candidateMoves(
      ctx,
      graph,
      root,
      factor,
      horizontal,
      includeSizes,
      same ? 2 : 0,
      edges,
    );
    possible.push(root.TopLeft!.Copy());
    const others = [...fixed];
    for (const n of graph.Nodes) if (!subgraph.includes(n)) others.push(n);
    let symmetryCost = includeSizes ? graph.CellSize : 1;
    symmetryCost *= subgraph.reduce((sum, n) => sum + n.Edges.length, 0);
    const options = {
      EdgeAbductions: abductions,
      IncludeNodeSizes: includeSizes,
      EnforceMinimumGap: false,
      PenalizeDirection: true,
    };
    let best = NodesEdgeLength(ctx, subgraph, options),
      bestDelta = 0;
    const snapshots = snapshotNodePositionsContext(ctx, 'Compaction', subgraph);
    for (const move of possible) {
      const delta = horizontal
        ? root.TopLeft!.X - move.X
        : root.TopLeft!.Y - move.Y;
      let overlaps = false;
      for (const n of subgraph) {
        const p = n.TopLeft!.Copy();
        if (horizontal) p.X -= delta;
        else p.Y -= delta;
        if (
          fixed.length > 0 &&
          isPointPastFixedOrigin(n, p.X, p.Y, includeSizes)
        ) {
          overlaps = true;
          break;
        }
        for (const other of others) {
          if (
            includeSizes ? doesOverlapAt(n, other, p) : other.TopLeft!.Equals(p)
          ) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) break;
      }
      if (overlaps) continue;
      for (const n of subgraph)
        moveNodeWithChildren(
          n,
          horizontal ? -delta : 0,
          horizontal ? 0 : -delta,
        );
      let distance: number;
      try {
        distance = NodesEdgeLength(ctx, subgraph, options);
        if (includeSizes)
          distance -= NodesSymmetry(ctx, subgraph, abductions) * symmetryCost;
      } catch (error) {
        restoreNodePositions(snapshots);
        throw error;
      }
      restoreNodePositions(snapshots);
      if (distance < best) {
        best = distance;
        bestDelta = delta;
      }
    }
    if (bestDelta !== 0) {
      changed = true;
      for (const n of subgraph)
        moveNodeWithChildren(
          n,
          horizontal ? -bestDelta : 0,
          horizontal ? 0 : -bestDelta,
        );
    }
  }
  return changed;
}
export function compaction(
  ctx: Context,
  graph: Graph,
  options: CompactionOptions,
): void {
  if (!axisValid(options.axis))
    throw new Error('TALA Compaction requires an axis');
  if (!(options.factor > 0) || !Number.isFinite(options.factor))
    throw new Error('TALA Compaction requires a finite positive factor');
  validateEngineGraph(ctx, 'Compaction', graph);
  const costs = {
      turn: graph.turnCost,
      crossing: graph.crossingCost,
      nonCenter: graph.nonCenterPortCost,
    },
    positions = snapshotNodePositionsContext(ctx, 'Compaction', graph.Nodes);
  let complete = false;
  try {
    const horizontal = axisIsHorizontal(options.axis),
      edges = visibilityEdges(ctx, graph, horizontal, options.includeSizes);
    inflateAlongAxis(
      graph,
      horizontal,
      options.includeSizes,
      options.factor,
      edges,
      options.transition,
    );
    let error = ctx.Err();
    if (error !== null)
      throw new Error(`Compaction: ${error.message}`, { cause: error });
    if (options.transition) {
      complete = true;
      return;
    }
    for (let i = 0; i < 20; i++)
      if (
        !shiftSubgraphs(
          ctx,
          graph,
          horizontal,
          options.includeSizes,
          options.factor,
          options.edgeAbductions,
          edges,
        )
      )
        break;
    const limit =
      options.moveWorkLimit === 0n ||
      options.moveWorkLimit > MaxOptimizationWorkUnits
        ? MaxOptimizationWorkUnits
        : options.moveWorkLimit;
    const guard = new OptimizationWorkGuard(ctx, 'CompactionMoves', limit);
    for (let i = 0; i < 20; i++)
      if (
        !compactAlongAxis(
          ctx,
          graph,
          horizontal,
          options.includeSizes,
          options.factor,
          options.edgeAbductions,
          edges,
          guard,
        )
      )
        break;
    error = ctx.Err();
    if (error !== null)
      throw new Error(`Compaction: ${error.message}`, { cause: error });
    complete = true;
  } finally {
    if (!complete) {
      restoreNodePositions(positions);
      graph.turnCost = costs.turn;
      graph.crossingCost = costs.crossing;
      graph.nonCenterPortCost = costs.nonCenter;
    }
  }
}
