// Translated from internal/routing/balance_route_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Segment } from '../geo/segment.js';
import type { RouteWorkGuard } from './stage-guard.js';
export class BalancedEdgeSegment extends Segment {
  constructor(
    start: Point,
    end: Point,
    public owner: Edge,
  ) {
    super(start, end);
  }
}
export function removeDuplicatePointsGuarded(
  points: Point[],
  guard: RouteWorkGuard,
): Point[] {
  if (points.length <= 1) {
    guard.Step();
    return points;
  }
  const out = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    guard.Step();
    const a = points[i - 1]!,
      b = points[i]!;
    if (a.X !== b.X || a.Y !== b.Y) out.push(b);
  }
  if (out.length === 1) {
    const p = out[0]!.Copy();
    p.X++;
    out.push(p);
  }
  return out;
}
export function nodeSegmentsGuarded(
  nodes: Node[],
  horizontal: boolean,
  guard: RouteWorkGuard,
): Segment[] {
  const out: Segment[] = [];
  for (const n of nodes) {
    guard.Step();
    const p = n.TopLeft!;
    if (horizontal)
      out.push(
        new Segment(p, new Point(p.X + n.Width, p.Y)),
        new Segment(
          new Point(p.X, p.Y + n.Height),
          new Point(p.X + n.Width, p.Y + n.Height),
        ),
      );
    else
      out.push(
        new Segment(p, new Point(p.X, p.Y + n.Height)),
        new Segment(
          new Point(p.X + n.Width, p.Y),
          new Point(p.X + n.Width, p.Y + n.Height),
        ),
      );
  }
  return out;
}
export function edgeSegmentsGuarded(
  edges: Edge[],
  horizontal: boolean,
  guard: RouteWorkGuard,
): BalancedEdgeSegment[] {
  const out: BalancedEdgeSegment[] = [];
  for (const edge of edges) {
    guard.Step();
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      const a = edge.Points[i]!,
        b = edge.Points[i + 1]!;
      if (horizontal ? a.Y === b.Y : a.X === b.X) {
        const ascending = horizontal ? a.X < b.X : a.Y < b.Y;
        out.push(
          new BalancedEdgeSegment(ascending ? a : b, ascending ? b : a, edge),
        );
      }
    }
  }
  return out;
}
export function routeSegmentBounds(
  segment: Segment,
  segments: Segment[],
  buffer: number,
  guard: RouteWorkGuard,
): [number, number] {
  let floor = -Infinity,
    ceil = Infinity;
  if (segment.Start.X === segment.End.X && segment.Start.Y === segment.End.Y) {
    guard.Step();
    return [floor, ceil];
  }
  const horizontal = segment.Start.X === segment.End.X;
  for (const other of segments) {
    guard.Step();
    if (horizontal) {
      if (
        other.End.Y < segment.Start.Y - buffer ||
        other.Start.Y > segment.End.Y + buffer
      )
        continue;
      if (other.Start.X <= segment.Start.X)
        floor = Math.max(floor, other.Start.X);
      if (other.Start.X > segment.Start.X) ceil = Math.min(ceil, other.Start.X);
    } else {
      if (
        other.End.X < segment.Start.X - buffer ||
        other.Start.X > segment.End.X + buffer
      )
        continue;
      if (other.Start.Y <= segment.Start.Y)
        floor = Math.max(floor, other.Start.Y);
      if (other.Start.Y > segment.Start.Y) ceil = Math.min(ceil, other.Start.Y);
    }
  }
  return [floor, ceil];
}
export function evenlyDistributeGuarded(
  floor: number,
  ceil: number,
  count: number,
  guard: RouteWorkGuard,
): number[] {
  if (count <= 0 || floor >= ceil) {
    guard.Step();
    return [];
  }
  const increment = Math.floor((ceil - floor) / (count + 1));
  if (increment <= 0) {
    guard.Step();
    return [];
  }
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    guard.Step();
    out.push(floor + i * increment);
  }
  return out;
}
export enum BalanceOrderStatus {
  Preserved,
  Reversed,
  ContactChanged,
}
export function checkBalanceOrder(
  batch: BalancedEdgeSegment[],
  batchSet: Set<BalancedEdgeSegment>,
  segments: BalancedEdgeSegment[],
  proposed: number[],
  horizontal: boolean,
  guard: RouteWorkGuard,
): BalanceOrderStatus {
  let moving = false;
  for (let i = 0; i < batch.length; i++) {
    guard.Step();
    const old = horizontal ? batch[i]!.Start.X : batch[i]!.Start.Y;
    if (proposed[i] !== old) {
      moving = true;
      break;
    }
  }
  if (!moving) return BalanceOrderStatus.Preserved;
  let status = BalanceOrderStatus.Preserved;
  for (const other of segments) {
    guard.Step();
    if (batchSet.has(other)) continue;
    for (let i = 0; i < batch.length; i++) {
      guard.Step();
      const seg = batch[i]!;
      if (seg.owner === other.owner) continue;
      const old = horizontal ? seg.Start.X : seg.Start.Y,
        position = horizontal ? other.Start.X : other.Start.Y,
        start = horizontal ? seg.Start.Y : seg.Start.X,
        end = horizontal ? seg.End.Y : seg.End.X,
        otherStart = horizontal ? other.Start.Y : other.Start.X,
        otherEnd = horizontal ? other.End.Y : other.End.X;
      if (proposed[i] === old) continue;
      if (
        Math.max(start, end) < Math.min(otherStart, otherEnd) ||
        Math.max(otherStart, otherEnd) < Math.min(start, end)
      )
        continue;
      if (old === position || proposed[i] === position)
        return BalanceOrderStatus.ContactChanged;
      if (old < position !== proposed[i]! < position)
        status = BalanceOrderStatus.Reversed;
    }
  }
  return status;
}
