// Translated internal/placement/container_orientation.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Orientation as O, IsVertical } from '../geo/orientation.js';
import { Round } from '../geo/math.js';
import { WorkGuard, MaxEngineWorkUnits, MaxGraphSize } from '../limits/work.js';
import { FlipArrangement } from '../layoutgraph/records.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import {
  containerPadding,
  fitNodeToGraph,
} from '../layoutgraph/node-geometry.js';
import {
  clusterResizeWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { NewTransaction } from '../layoutgraph/transaction.js';
import {
  ErrInvalidCandidate,
  ErrNonImprovingCandidate,
  IsCandidateRejection,
} from '../layoutgraph/errors.js';
import { PaddingBetween } from '../grouping/clusters.js';
import { compaction } from './compaction.js';
import { LayoutAxis } from './axis.js';
import { syncNestedGeometry } from './orthogonal.js';
const orientationDisabled = Symbol('containerOrientationDisabled');
export function orientationContext(ctx: Context, graph: Graph): Context {
  const guard = new WorkGuard(
    ctx,
    'ContainerOrientationPreflight',
    MaxEngineWorkUnits,
  );
  for (const edge of graph.Edges) {
    guard.Step();
    if (edge.IsLoop())
      return {
        Done: () => ctx.Done(),
        Err: () => ctx.Err(),
        Value: (key) => (key === orientationDisabled ? true : ctx.Value?.(key)),
      };
  }
  guard.Finish();
  return ctx;
}
export interface ContainerFlow {
  x: number;
  y: number;
  across: number;
  along: number;
}
export function interiorFlow(
  graph: Graph,
  local: Map<Node, boolean>,
  guard: WorkGuard,
): ContainerFlow {
  const seen = new Map<Node, Set<Node>>(),
    flow = { x: 0, y: 0, across: 0, along: 0 };
  for (const edge of graph.Edges) {
    guard.Step();
    const [from, to, ok] = edge.DirectedEndpoints();
    if (!ok || from === to || !local.get(from!) || !local.get(to!)) continue;
    const targets = seen.get(from!) ?? new Set<Node>();
    if (targets.has(to!)) continue;
    targets.add(to!);
    seen.set(from!, targets);
    const a = from!.Center(),
      b = to!.Center(),
      dx = b.X - a.X,
      dy = b.Y - a.Y,
      length = Math.abs(dx) + Math.abs(dy);
    if (length === 0) continue;
    flow.x += dx / length;
    flow.across += Math.abs(dx) / length;
    flow.y += dy / length;
    flow.along += Math.abs(dy) / length;
  }
  guard.Finish();
  return flow;
}
export function orientationFootprintSize(
  graph: Graph,
  root: Node,
): [number, number] {
  const oldWidth = root.Width,
    oldHeight = root.Height;
  try {
    fitNodeToGraph(root, graph, containerPadding(graph, root, false));
    return [root.Width, root.Height];
  } finally {
    root.Width = oldWidth;
    root.Height = oldHeight;
  }
}
export function orientationFitsContainer(graph: Graph, root: Node): boolean {
  const [w, h] = orientationFootprintSize(graph, root);
  return w >= 0 && h >= 0 && w <= MaxGraphSize && h <= MaxGraphSize;
}
export function orientSourceInterior(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  obstacles: Box[],
): void {
  const error = ctx.Err();
  if (error !== null) throw error;
  if (
    ctx.Value?.(orientationDisabled) === true ||
    root === null ||
    graph.Nodes.length < 3 ||
    graph.Nodes.length > 16 ||
    obstacles.length !== 0 ||
    root.FixedTopLeft !== null ||
    root.Cluster !== null ||
    root.Sequence !== null ||
    root.ForceHierarchy ||
    root.Graph!.Direction(root) !== O.NONE
  )
    return;
  const direction = graph.Direction(root.container());
  if (!IsVertical(direction) || root.Edges.length < 3) return;
  const guard = new WorkGuard(ctx, 'ContainerOrientation', MaxEngineWorkUnits),
    destinations = new Set<Node>();
  for (const edge of root.Edges) {
    guard.Step();
    const [from, to, ok] = edge.DirectedEndpoints();
    if (!ok || from !== root || to === root) return;
    destinations.add(to!);
  }
  if (destinations.size < 2) return;
  const local = new Map<Node, boolean>();
  for (const n of graph.Nodes) {
    if (
      n.isContainer ||
      n.Hierarchy !== null ||
      n.FixedTopLeft !== null ||
      n.Sequence !== null ||
      graph.Trees.has(n) ||
      graph.Sequences.has(n) ||
      n.HerdAssignment !== null
    )
      return;
    for (const offset of n.LoopOffsets.values()) if (offset > 0) return;
    local.set(n, true);
  }
  for (const n of graph.Nodes)
    for (const near of n.Nears) if (!local.get(near)) return;
  const flow = interiorFlow(graph, local, guard);
  if (flow.across <= flow.along + 1e-9 || Math.abs(flow.x) <= 1e-9) return;
  let turn = 1;
  if (flow.x < 0 !== (direction === O.Top)) turn = -1;
  const [beforeWidth, beforeHeight] = orientationFootprintSize(graph, root);
  const txn = NewTransaction(ctx, graph, {
    AffectContainers: false,
    IgnoreContainerEscape: true,
    AffectEdgeRoutes: false,
  });
  txn.AddOp(() => {
    const centers = new Map(graph.Nodes.map((n) => [n, n.Center().Copy()]));
    for (const n of graph.Nodes) {
      guard.Step();
      const cluster = graph.Clusters.get(n);
      if (cluster !== undefined) {
        cluster.Arrangement = FlipArrangement(cluster.Arrangement);
        cluster.DesiredArrangement = cluster.Arrangement;
        cluster.Padding = PaddingBetween(cluster, true);
        clusterResizeWithWork(cluster, n, unmeteredGroupGeometry);
      }
      const p = centers.get(n)!;
      n.TopLeft = new Point(
        Round(-turn * p.Y - n.Width / 2),
        Round(turn * p.X - n.Height / 2),
      );
    }
    syncNestedGeometry(graph);
    const oldCell = graph.CellSize;
    graph.CellSize = 1;
    try {
      for (const axis of [LayoutAxis.Horizontal, LayoutAxis.Vertical])
        compaction(ctx, graph, {
          edgeAbductions: null,
          axis,
          includeSizes: true,
          factor: 1,
          transition: true,
          moveWorkLimit: 0n,
        });
    } finally {
      graph.CellSize = oldCell;
    }
    syncNestedGeometry(graph);
    const [tl, br] = BoundingBox(graph),
      [width, height] = orientationFootprintSize(graph, root);
    if (
      br!.X - tl!.X > MaxGraphSize ||
      br!.Y - tl!.Y > MaxGraphSize ||
      !(
        width >= 0 &&
        height >= 0 &&
        width <= MaxGraphSize &&
        height <= MaxGraphSize
      )
    )
      throw ErrInvalidCandidate;
    if (width * height > 2 * beforeWidth * beforeHeight)
      throw ErrNonImprovingCandidate;
    const after = interiorFlow(graph, local, guard),
      sign = direction === O.Top ? -1 : 1;
    if (sign * after.y <= sign * flow.y + 1e-9) throw ErrNonImprovingCandidate;
    guard.Finish();
  });
  try {
    txn.Commit(ctx);
  } catch (err) {
    if (!IsCandidateRejection(err)) throw err;
  }
}
