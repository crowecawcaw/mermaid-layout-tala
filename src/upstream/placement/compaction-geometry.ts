// Translated internal/placement/compaction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { New as invariant } from '../invariant/errors.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { Slice } from '../gosort/slice.js';
import { deltaToGuarded } from '../layoutgraph/node-spacing.js';
import {
  isVisibilityGraphCandidate,
  IsBlocked,
} from '../layoutgraph/node-spatial.js';
import { maxCompactionCandidateCount } from './types.js';
export function orderedAlongAxis(graph: Graph, horizontal: boolean): Node[] {
  const nodes = [...graph.Nodes];
  Slice(nodes, (a, b) => {
    const x = horizontal ? a.TopLeft!.X : a.TopLeft!.Y,
      y = horizontal ? b.TopLeft!.X : b.TopLeft!.Y;
    return x === y ? a.ID < b.ID : x < y;
  });
  return nodes;
}
export function visibilityEdges(
  ctx: Context,
  graph: Graph,
  horizontal: boolean,
  includeSizes: boolean,
): Edge[] {
  const guard = new WorkGuard(ctx, 'CompactionVisibility', MaxEngineWorkUnits),
    edges: Edge[] = [];
  for (const node of graph.Nodes) {
    guard.Step();
    for (const other of graph.Nodes) {
      guard.Step();
      if (node.ID === other.ID) continue;
      const delta = deltaToGuarded(node, other, node.TopLeft, null);
      if (
        !isVisibilityGraphCandidate(
          node,
          horizontal,
          true,
          includeSizes,
          other,
          delta,
        )
      )
        continue;
      let blocked = false;
      for (const obstruction of graph.Nodes) {
        guard.Step();
        if (obstruction.ID === node.ID || obstruction.ID === other.ID) continue;
        if (IsBlocked(obstruction, node, other, includeSizes, horizontal)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) edges.push(new Edge(node, other));
    }
  }
  guard.Finish();
  return edges;
}
export function nearestFrom(
  edges: Edge[],
  node: Node,
  horizontal: boolean,
  includeSizes: boolean,
): Node | null {
  let nearest: Node | null = null,
    largest = -Infinity;
  for (const e of edges) {
    if (e.To !== node) continue;
    let value = horizontal ? e.From.TopLeft!.X : e.From.TopLeft!.Y;
    if (includeSizes) value += horizontal ? e.From.Width : e.From.Height;
    if (value > largest) {
      largest = value;
      nearest = e.From;
    }
  }
  return nearest;
}
export function compactionFloor(
  graph: Graph,
  anchor: Node,
  factor: number,
  horizontal: boolean,
  includeSizes: boolean,
  padding: number,
): number {
  let floor: number;
  if (horizontal)
    floor = includeSizes
      ? Math.ceil((anchor.TopLeft!.X + factor * anchor.Width) / graph.CellSize)
      : anchor.TopLeft!.X + Math.floor(factor);
  else
    floor = includeSizes
      ? Math.ceil((anchor.TopLeft!.Y + factor * anchor.Height) / graph.CellSize)
      : anchor.TopLeft!.Y + Math.floor(factor);
  if (includeSizes) {
    const val = horizontal
      ? anchor.TopLeft!.X + anchor.Width
      : anchor.TopLeft!.Y + anchor.Height;
    while (floor * graph.CellSize - val <= padding) floor += 1;
  }
  return floor;
}
export function globallyFurthestBehind(
  graph: Graph,
  horizontal: boolean,
): Node {
  let behind = graph.Nodes[0]!;
  for (const n of graph.Nodes) {
    if (
      horizontal
        ? n.TopLeft!.X < behind.TopLeft!.X
        : n.TopLeft!.Y < behind.TopLeft!.Y
    )
      behind = n;
  }
  return behind;
}
export function candidateMoves(
  ctx: Context,
  graph: Graph,
  node: Node,
  factor: number,
  horizontal: boolean,
  includeSizes: boolean,
  floorDecrease: number,
  edges: Edge[],
): Point[] {
  const guard = new WorkGuard(ctx, 'CompactionCandidates', MaxEngineWorkUnits);
  const nearest =
    nearestFrom(edges, node, horizontal, includeSizes) ??
    globallyFurthestBehind(graph, horizontal);
  let floor = compactionFloor(
    graph,
    nearest,
    factor,
    horizontal,
    includeSizes,
    deltaToGuarded(node, nearest, node.TopLeft, null),
  );
  const hasFixed = graph.Nodes.some((n) => n.FixedTopLeft !== null);
  if (horizontal) {
    const another = includeSizes
      ? nearest.TopLeft!.Y > node.TopLeft!.Y + node.Height ||
        nearest.TopLeft!.Y + nearest.Height < node.TopLeft!.Y
      : nearest.TopLeft!.Y !== node.TopLeft!.Y;
    if (nearest.TopLeft!.X === node.TopLeft!.X || another) {
      if (includeSizes) {
        floor = nearest.TopLeft!.X / graph.CellSize;
        if (hasFixed) floor = Round(floor);
      } else floor = nearest.TopLeft!.X;
    }
  } else {
    const another = includeSizes
      ? nearest.TopLeft!.X > node.TopLeft!.X + node.Width ||
        nearest.TopLeft!.X + nearest.Width < node.TopLeft!.X
      : nearest.TopLeft!.X !== node.TopLeft!.X;
    if (nearest.TopLeft!.Y === node.TopLeft!.Y || another) {
      if (includeSizes) {
        floor = nearest.TopLeft!.Y / graph.CellSize;
        if (hasFixed) floor = Round(floor);
      } else floor = nearest.TopLeft!.Y;
    }
  }
  const ceil =
      (horizontal ? node.TopLeft!.X : node.TopLeft!.Y) /
      (includeSizes ? graph.CellSize : 1),
    start = floor - floorDecrease;
  if (!Number.isFinite(start) || !Number.isFinite(ceil))
    throw invariant('compaction candidate range is not finite');
  if (start <= ceil) {
    const count = Math.floor(ceil - start) + 1;
    if (count > maxCompactionCandidateCount)
      throw new Error(
        `TALA compaction candidate count ${count.toFixed(0)} exceeds limit ${maxCompactionCandidateCount}`,
      );
  }
  const positions: Point[] = [];
  for (let i = start; i <= ceil; i++) {
    guard.Step();
    const value = includeSizes ? i * graph.CellSize : i;
    positions.push(
      horizontal
        ? new Point(value, node.TopLeft!.Y)
        : new Point(node.TopLeft!.X, value),
    );
  }
  guard.Finish();
  return positions;
}
