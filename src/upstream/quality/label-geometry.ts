// Translated from internal/quality/labels.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Segment } from '../geo/segment.js';
import type { Box } from '../geo/box.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { WorkGuard } from '../limits/work.js';
import { sortSharedSegmentGroup } from '../labeling/shared-segments.js';
import { boxesOverlapWithPadding, boxCovers } from './inspection.js';
export function nodeOverlapCount(
  box: Box,
  nodes: Node[],
  padding: number,
  guard: WorkGuard,
): number {
  let count = 0;
  for (const n of nodes) {
    guard.Step();
    if (boxesOverlapWithPadding(box, n.Box, padding)) count++;
  }
  return count;
}
export function partialNodeOverlapCount(
  box: Box,
  nodes: Node[],
  padding: number,
  guard: WorkGuard,
): number {
  let count = 0;
  for (const n of nodes) {
    guard.Step();
    if (boxesOverlapWithPadding(box, n.Box, padding) && !boxCovers(n.Box, box))
      count++;
  }
  return count;
}
export function boxOverlapCount(
  box: Box,
  others: Box[],
  padding: number,
  guard: WorkGuard,
): number {
  let count = 0;
  for (const other of others) {
    guard.Step();
    if (boxesOverlapWithPadding(box, other, padding)) count++;
  }
  return count;
}
export function nodeOverlapArea(
  box: Box,
  nodes: Node[],
  padding: number,
  partial: boolean,
  guard: WorkGuard,
): number {
  let area = 0;
  for (const n of nodes) {
    guard.Step();
    if (
      !boxesOverlapWithPadding(box, n.Box, padding) ||
      (partial && boxCovers(n.Box, box))
    )
      continue;
    if (padding === 0 || boxesOverlapWithPadding(box, n.Box, 0)) {
      const xs = [
          box.TopLeft.X,
          box.TopLeft.X + box.Width,
          n.TopLeft!.X,
          n.TopLeft!.X + n.Width,
        ].sort((a, b) => a - b),
        ys = [
          box.TopLeft.Y,
          box.TopLeft.Y + box.Height,
          n.TopLeft!.Y,
          n.TopLeft!.Y + n.Height,
        ].sort((a, b) => a - b);
      area += (xs[2]! - xs[1]!) * (ys[2]! - ys[1]!);
    }
    if (!n.IsContainer()) area += box.Width * box.Height;
  }
  return area;
}
function orientation(p: Point, q: Point, r: Point): number {
  return (q.Y - p.Y) * (r.X - p.X) - (q.X - p.X) * (r.Y - p.Y);
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const x = orientation(a, b, c),
    y = orientation(a, b, d),
    z = orientation(c, d, a),
    w = orientation(c, d, b);
  if (x === 0 && y === 0 && z === 0 && w === 0)
    return (
      Math.min(a.X, b.X) <= Math.max(c.X, d.X) &&
      Math.min(c.X, d.X) <= Math.max(a.X, b.X) &&
      Math.min(a.Y, b.Y) <= Math.max(c.Y, d.Y) &&
      Math.min(c.Y, d.Y) <= Math.max(a.Y, b.Y)
    );
  const straddles = (m: number, n: number) =>
    m === 0 || n === 0 || m < 0 !== n < 0;
  return straddles(x, y) && straddles(z, w);
}
export function boxOverlapsLine(
  box: Box,
  a: Point,
  b: Point,
  padding: number,
): boolean {
  const left = box.TopLeft.X - padding,
    right = box.TopLeft.X + box.Width + padding,
    top = box.TopLeft.Y - padding,
    bottom = box.TopLeft.Y + box.Height + padding;
  const contains = (p: Point) =>
    left <= p.X && right >= p.X && top <= p.Y && bottom >= p.Y;
  if (contains(a) || contains(b)) return true;
  const tl = new Point(left, top),
    tr = new Point(right, top),
    br = new Point(right, bottom),
    bl = new Point(left, bottom);
  return (
    segmentsIntersect(tl, tr, a, b) ||
    segmentsIntersect(tr, br, a, b) ||
    segmentsIntersect(br, bl, a, b) ||
    segmentsIntersect(bl, tl, a, b)
  );
}
export function edgeOverlapCount(
  box: Box,
  edges: Edge[],
  padding: number,
  guard: WorkGuard,
): number {
  let count = 0;
  for (const e of edges)
    for (let i = 1; i < e.Points.length; i++) {
      guard.Step();
      if (boxOverlapsLine(box, e.Points[i - 1]!, e.Points[i]!, padding))
        count++;
    }
  return count;
}
export function findSharedSegments(edges: Edge[], guard: WorkGuard): Segment[] {
  guard.Step();
  const vertical = new Map<number, Segment[]>(),
    horizontal = new Map<number, Segment[]>();
  for (const e of edges) {
    guard.Step();
    for (let i = 0; i < e.Points.length - 1; i++) {
      guard.Step();
      const s = new Segment(e.Points[i]!.Copy(), e.Points[i + 1]!.Copy());
      let groups: Map<number, Segment[]>, key: number;
      if (s.Start.X === s.End.X) {
        if (s.End.Y < s.Start.Y) [s.End.Y, s.Start.Y] = [s.Start.Y, s.End.Y];
        groups = vertical;
        key = s.Start.X;
      } else if (s.Start.Y === s.End.Y) {
        if (s.End.X < s.Start.X) [s.End.X, s.Start.X] = [s.Start.X, s.End.X];
        groups = horizontal;
        key = s.Start.Y;
      } else continue;
      const list = groups.get(key) ?? [];
      list.push(s);
      groups.set(key, list);
    }
  }
  const shared: Segment[] = [];
  const add = (groups: Map<number, Segment[]>, horizontal: boolean) => {
    const coordinate = (p: Point) => (horizontal ? p.X : p.Y),
      set = (p: Point, value: number) => {
        if (horizontal) p.X = value;
        else p.Y = value;
      };
    for (const segments of groups.values()) {
      guard.Step();
      if (segments.length === 1) continue;
      sortSharedSegmentGroup(segments, coordinate, () => guard.Step());
      let previous = segments[0]!,
        overlap: Segment | null = null;
      for (let i = 1; i < segments.length; i++) {
        guard.Step();
        const current = segments[i]!;
        if (coordinate(previous.End) > coordinate(current.Start)) {
          if (!overlap) {
            overlap = new Segment(current.Start.Copy(), current.Start.Copy());
            set(
              overlap.End,
              Math.min(coordinate(previous.End), coordinate(current.End)),
            );
          } else
            set(
              overlap.End,
              Math.max(
                coordinate(overlap.End),
                Math.min(coordinate(previous.End), coordinate(current.End)),
              ),
            );
        } else if (overlap) {
          shared.push(overlap);
          overlap = null;
        }
        if (coordinate(current.End) > coordinate(previous.End))
          previous = current;
      }
      if (overlap) shared.push(overlap);
    }
  };
  add(vertical, false);
  add(horizontal, true);
  return shared;
}
