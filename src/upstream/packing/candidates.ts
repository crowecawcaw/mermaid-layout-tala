// Translated from internal/packing/binpack.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { WorkGuard } from '../limits/work.js';
import { New as invariant } from '../invariant/errors.js';
import { Point } from '../geo/point.js';
import { Segment } from '../geo/segment.js';
import { Round } from '../geo/math.js';
import {
  Orientation as O,
  IsDiagonal,
  IsHorizontal,
  IsVertical,
} from '../geo/orientation.js';
import { nodeOrientation, overlapsLine } from '../layoutgraph/node-spatial.js';
import { NodeGap, TableNodeGap } from '../layoutgraph/geometry-policy.js';
import { FixedBoundingBox, NodeBoundingBox } from '../graphbounds/bounds.js';
const subgraphPadding = 20;
export function placementCandidatesGuarded(
  nodes: Node[],
  root: Node | null,
  considerWithin: boolean,
  edgesPlaced: boolean,
  guard: WorkGuard,
): Point[] {
  const points: Point[] = [],
    inContainer: Node[] = [];
  for (const n of nodes) {
    guard.Step();
    if (n.Container !== root) continue;
    inContainer.push(n);
    if (!considerWithin) continue;
    const side = n.IsTable() ? TableNodeGap : subgraphPadding;
    let right = false,
      bottom = false,
      bottomRight = false;
    if (!edgesPlaced)
      for (const edge of n.Edges) {
        guard.Step();
        switch (nodeOrientation(n, n.Adjacent(edge))) {
          case O.Left:
            right = true;
            break;
          case O.Top:
            bottom = true;
            break;
          case O.TopLeft:
            bottomRight = true;
            break;
        }
        if (right && bottom && bottomRight) break;
      }
    if (!right)
      points.push(new Point(n.TopLeft!.X + n.Width + side, n.TopLeft!.Y));
    if (!bottom)
      points.push(
        new Point(n.TopLeft!.X, n.TopLeft!.Y + n.Height + subgraphPadding),
      );
    if (!bottomRight)
      points.push(
        new Point(n.TopLeft!.X + n.Width + side, n.TopLeft!.Y + n.Height),
      );
  }
  const [tl, br] = FixedBoundingBox(inContainer, guard);
  points.push(
    new Point(br.X, tl.Y),
    new Point(br.X, br.Y),
    new Point(tl.X, br.Y),
    new Point(br.X + subgraphPadding, tl.Y),
    new Point(br.X + subgraphPadding, br.Y),
    new Point(tl.X, br.Y + subgraphPadding),
  );
  guard.Finish();
  return points;
}
export function estimateEdgeSegments(
  edge: Edge,
  g: Graph,
  xgap: number,
  ygap: number,
  guard: WorkGuard,
): Segment[] {
  guard.Step();
  if (!edge || !edge.From || !edge.To || !edge.From.TopLeft || !edge.To.TopLeft)
    throw invariant('BinPack segment estimate encountered an incomplete edge');
  const orientation = nodeOrientation(edge.From, edge.To);
  if (
    !IsDiagonal(orientation) &&
    !edge.From.isClusterVessel &&
    !edge.To.isClusterVessel
  ) {
    const from = edge.From.Center(),
      to = edge.To.Center();
    if (IsHorizontal(orientation) && Math.abs(from.X - to.X) > xgap)
      return [new Segment(from, to)];
    if (IsVertical(orientation) && Math.abs(from.Y - to.Y) > ygap)
      return [new Segment(from, to)];
    return [];
  }
  const endpoints = (node: Node): Point[] => {
    if (!node.isClusterVessel) return [node.Center()];
    const cluster = g.Clusters.get(node)!,
      center = node.Center(),
      [tl, br] = NodeBoundingBox(node, null, { Step() {}, Finish() {} });
    if (cluster.Arrangement === 'Row')
      return [new Point(tl.X, center.Y), new Point(br.X, center.Y)];
    if (cluster.Arrangement === 'Column')
      return [new Point(center.X, tl.Y), new Point(center.X, br.Y)];
    return [];
  };
  const segments: Segment[] = [];
  for (const from of endpoints(edge.From))
    for (const to of endpoints(edge.To)) {
      guard.Step();
      segments.push(
        new Segment(from, new Point(from.X, to.Y)),
        new Segment(new Point(from.X, to.Y), to),
        new Segment(from, new Point(to.X, from.Y)),
        new Segment(new Point(to.X, from.Y), to),
      );
      const midX = Round((from.X + to.X) / 2),
        midY = Round((from.Y + to.Y) / 2);
      segments.push(
        new Segment(new Point(midX, from.Y), new Point(midX, to.Y)),
        new Segment(new Point(from.X, midY), new Point(to.X, midY)),
      );
    }
  guard.Finish();
  return segments;
}
export function estimateRouteSegments(
  nodes: Node[],
  g: Graph,
  xgap: number,
  ygap: number,
  guard: WorkGuard,
): Segment[] {
  const segments: Segment[] = [],
    unique = new Set<Edge>();
  for (const node of nodes) {
    guard.Step();
    for (const edge of node.Edges) {
      guard.Step();
      if (unique.has(edge)) continue;
      unique.add(edge);
      segments.push(...estimateEdgeSegments(edge, g, xgap, ygap, guard));
    }
  }
  guard.Finish();
  return segments;
}
export function blocksRoutesWithDeltasGuarded(
  g: Graph,
  packing: Node[],
  packed: Node[][],
  packedSegments: Segment[],
  xgap: number,
  ygap: number,
  guard: WorkGuard,
): boolean {
  if (!guard) throw new Error('TALA BinPack route check requires a work guard');
  const segments = estimateRouteSegments(packing, g, xgap, ygap, guard);
  for (const nodes of packed) {
    guard.Step();
    for (const n of nodes) {
      guard.Step();
      for (const seg of segments) {
        guard.Step();
        if (overlapsLine(n, seg.Start, seg.End, NodeGap)) {
          guard.Finish();
          return true;
        }
      }
    }
  }
  for (const n of packing) {
    guard.Step();
    for (const seg of packedSegments) {
      guard.Step();
      if (overlapsLine(n, seg.Start, seg.End, NodeGap)) {
        guard.Finish();
        return true;
      }
    }
  }
  guard.Finish();
  return false;
}
export interface PackingEdgeSegment {
  Start: Point;
  End: Point;
  edge: Edge;
}
export function routedEdgeSegments(
  edges: Edge[],
  horizontal: boolean,
  guard: WorkGuard,
): PackingEdgeSegment[] {
  const out: PackingEdgeSegment[] = [];
  for (const edge of edges) {
    guard.Step();
    if (!edge)
      throw invariant('BinPack routed segment scan encountered a nil edge');
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      const a = edge.Points[i],
        b = edge.Points[i + 1];
      if (!a || !b)
        throw invariant('BinPack routed segment scan encountered a nil point');
      if (horizontal ? a.Y === b.Y : a.X === b.X) {
        const ascending = horizontal ? a.X < b.X : a.Y < b.Y;
        out.push({ Start: ascending ? a : b, End: ascending ? b : a, edge });
      }
    }
  }
  guard.Finish();
  return out;
}
