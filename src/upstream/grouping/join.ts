// Translated from internal/grouping/join.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxTransactionWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Point, GetMedian } from '../geo/point.js';
import { EuclideanDistance } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import {
  allDescendantNodesGuarded,
  moveNodeWithChildren,
  fixedOrigin,
} from '../layoutgraph/containment.js';
import { distanceClustersWithWorkGuard } from '../layoutgraph/distance-clusters.js';
import { ExistingTransactionWorkGuard } from '../layoutgraph/transaction.js';
import {
  boundsWithWorkGuard,
  centerWithWorkGuard,
} from '../layoutgraph/node-geometry.js';
import { doesOverlapWithDimensionsContext } from '../layoutgraph/bad-state.js';
import { New as invariant } from '../invariant/errors.js';
export class JoinPositionJournal {
  captured = new Set<Node>();
  snapshots: { node: Node; pointer: Point | null; value: Point | null }[] = [];
  capture(node: Node | null): boolean {
    if (node === null || this.captured.has(node)) return false;
    this.captured.add(node);
    this.snapshots.push({
      node,
      pointer: node.TopLeft,
      value: node.TopLeft?.Copy() ?? null,
    });
    return true;
  }
  moveWithChildren(node: Node, dx: number, dy: number, guard: WorkGuard): void {
    if (dx === 0 && dy === 0) return;
    const firstCapture = this.capture(node);
    if (node.Graph === null) {
      guard.Step();
      moveNodeWithChildren(node, dx, dy);
      guard.Finish();
      return;
    }
    const graph = node.Graph;
    let hasDescendants =
      node.IsContainer() && (graph.Containers.get(node)?.length ?? 0) > 0;
    if (node.IsClusterVessel())
      hasDescendants =
        hasDescendants || (graph.Clusters.get(node)?.Nodes.length ?? 0) > 0;
    hasDescendants =
      hasDescendants || (graph.Sequences.get(node)?.Nodes.length ?? 0) > 0;
    const descendants = hasDescendants
      ? allDescendantNodesGuarded(graph, node, true, guard)
      : [];
    if (firstCapture)
      for (const descendant of descendants) this.capture(descendant);
    guard.Add(BigInt(1 + descendants.length));
    node.Translate(dx, dy);
    for (const descendant of descendants) descendant.Translate(dx, dy);
  }
  restore(): void {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const snapshot = this.snapshots[i]!;
      snapshot.node.TopLeft = snapshot.pointer;
      if (snapshot.pointer !== null) {
        snapshot.pointer.X = snapshot.value!.X;
        snapshot.pointer.Y = snapshot.value!.Y;
      }
    }
  }
}
export function joinMedian(points: Point[], guard: WorkGuard): Point {
  guard.Add(2n * BigInt(points.length));
  for (let width = 1; width < points.length; width *= 2) {
    guard.Add(2n * BigInt(points.length));
    if (width > Math.trunc(points.length / 2)) break;
  }
  return GetMedian(points);
}
export function joinContainerFixedOrigin(
  graph: Graph,
  container: Node | null,
  guard: WorkGuard,
): Point | null {
  for (const node of graph.Nodes) {
    guard.Step();
    if (node.container() !== container) continue;
    const origin = fixedOrigin(node);
    if (origin !== null) return origin;
  }
  return null;
}
function check(ctx: Context): void {
  const err = ctx.Err();
  if (err !== null)
    throw new Error(`PlaceNodes: ${err.message}`, { cause: err });
}
export function JoinDistancedClusters(ctx: Context, graph: Graph): void {
  check(ctx);
  let [guard, sharedGuard] = ExistingTransactionWorkGuard(ctx, 'PlaceNodes');
  let preflightWork = BigInt(graph.Nodes.length);
  if (sharedGuard) guard!.Add(preflightWork);
  const fixedNodes = graph.Nodes.filter((n) => n.FixedTopLeft !== null);
  if (graph.Nodes.length - fixedNodes.length <= 1) {
    if (sharedGuard) guard!.Finish();
    return;
  }
  if (graph.Edges.length === 0) {
    preflightWork += BigInt(graph.Nodes.length);
    if (sharedGuard) guard!.Add(BigInt(graph.Nodes.length));
    let hasJoinReference = false;
    for (const node of graph.Nodes)
      if (node.Edges.length > 0 || node.Nears.size > 0) {
        hasJoinReference = true;
        break;
      }
    if (!hasJoinReference) {
      if (sharedGuard) guard!.Finish();
      return;
    }
  }
  if (!sharedGuard) {
    guard = new WorkGuard(ctx, 'PlaceNodes', MaxTransactionWorkUnits);
    guard.Add(preflightWork);
  }
  const work = guard!,
    positions = new JoinPositionJournal();
  let complete = false;
  const finish = () => {
    work.Finish();
    complete = true;
  };
  try {
    const clusters = distanceClustersWithWorkGuard(
      graph.Nodes,
      3 * graph.CellSize,
      work,
    );
    if (clusters === null) {
      finish();
      return;
    }
    let target: Point;
    if (fixedNodes.length > 0) target = centerWithWorkGuard(fixedNodes, work);
    else {
      const centers: Point[] = [];
      for (const cluster of clusters)
        centers.push(centerWithWorkGuard(cluster, work));
      target = joinMedian(centers, work);
    }
    const wouldOverlap = (node: Node, x: number, y: number, cluster: Node[]) =>
      doesOverlapWithDimensionsContext(
        graph,
        node,
        new Point(x, y),
        node.Width,
        node.Height,
        cluster,
        null,
        work,
      );
    const inchTowardsTarget = (
      cluster: Node[],
      origin: Point | null,
    ): boolean => {
      const [tl, br] = boundsWithWorkGuard(cluster, work),
        center = new Point(
          tl!.X + (br!.X - tl!.X) / 2,
          tl!.Y + (br!.Y - tl!.Y) / 2,
        ),
        distance = EuclideanDistance(center.X, center.Y, target.X, target.Y),
        length = Math.max(br!.X - tl!.X, br!.Y - tl!.Y);
      if (distance < length / 2) return false;
      let dx = 0,
        dy = 0;
      const orientation = center.GetOrientation(target);
      if (orientation === O.NONE) throw invariant('No orientation');
      if (
        orientation === O.Top ||
        orientation === O.TopLeft ||
        orientation === O.TopRight
      )
        dy = 1;
      if (
        orientation === O.Bottom ||
        orientation === O.BottomLeft ||
        orientation === O.BottomRight
      )
        dy = -1;
      if (
        orientation === O.Left ||
        orientation === O.BottomLeft ||
        orientation === O.TopLeft
      )
        dx = 1;
      if (
        orientation === O.Right ||
        orientation === O.TopRight ||
        orientation === O.BottomRight
      )
        dx = -1;
      if (dx === 0 && dy === 0) return false;
      dx *= graph.CellSize;
      dy *= graph.CellSize;
      let hasOverlap = false,
        hasOverlapX = false,
        hasOverlapY = false;
      for (const node of cluster) {
        const x = node.TopLeft!.X + dx,
          y = node.TopLeft!.Y + dy;
        if (!hasOverlap) {
          if (origin !== null) {
            if (x < origin.X) {
              hasOverlapX = true;
              hasOverlap = true;
            }
            if (y < origin.Y) {
              hasOverlapY = true;
              hasOverlap = true;
            }
          }
          if (!hasOverlap) hasOverlap = wouldOverlap(node, x, y, cluster);
        }
        positions.moveWithChildren(node, dx, dy, work);
      }
      if (hasOverlap)
        for (const node of cluster)
          positions.moveWithChildren(node, -dx, -dy, work);
      if (dx !== 0 && dy !== 0) {
        if (hasOverlapX && !hasOverlapY) {
          hasOverlap = false;
          for (const node of cluster) {
            const x = node.TopLeft!.X,
              y = node.TopLeft!.Y + dy;
            let overlaps = origin !== null && (x < origin.X || y < origin.Y);
            if (!overlaps) overlaps = wouldOverlap(node, x, y, cluster);
            if (overlaps) hasOverlap = true;
            positions.moveWithChildren(node, 0, dy, work);
          }
          if (hasOverlap)
            for (const node of cluster)
              positions.moveWithChildren(node, 0, -dy, work);
        } else if (!hasOverlapX && hasOverlapY) {
          hasOverlap = false;
          for (const node of cluster) {
            const x = node.TopLeft!.X + dx,
              y = node.TopLeft!.Y;
            let overlaps = origin !== null && (x < origin.X || y < origin.Y);
            if (!overlaps) overlaps = wouldOverlap(node, x, y, cluster);
            if (overlaps) hasOverlap = true;
            positions.moveWithChildren(node, dx, 0, work);
          }
          if (hasOverlap)
            for (const node of cluster)
              positions.moveWithChildren(node, -dx, 0, work);
        }
      }
      return !hasOverlap;
    };
    for (let iteration = 0; iteration < 1000; iteration++) {
      check(ctx);
      work.Add(BigInt(1 + clusters.length));
      let moved = false;
      for (const cluster of clusters) {
        check(ctx);
        let origin: Point | null = null;
        if (fixedNodes.length > 0)
          origin = joinContainerFixedOrigin(
            graph,
            cluster[0]!.container(),
            work,
          );
        if (inchTowardsTarget(cluster, origin)) moved = true;
      }
      if (!moved) break;
    }
    check(ctx);
    finish();
  } finally {
    if (!complete) positions.restore();
  }
}
