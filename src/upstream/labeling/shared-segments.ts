// Translated from internal/labeling/{placement,guard}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Segment } from '../geo/segment.js';
export function sortSharedSegmentGroup(
  segments: Segment[],
  coordinate: (p: Point) => number,
  check: (() => void) | null,
): void {
  if (segments.length < 2) return;
  let buffer = new Array<Segment>(segments.length),
    items = segments;
  const less = (a: Segment, b: Segment) =>
    coordinate(a.Start) === coordinate(b.Start)
      ? coordinate(a.End) < coordinate(b.End)
      : coordinate(a.Start) < coordinate(b.Start);
  for (let width = 1; width < items.length;) {
    for (let start = 0; start < items.length; start += 2 * width) {
      const middle = Math.min(start + width, items.length),
        end = Math.min(start + 2 * width, items.length);
      let left = start,
        right = middle,
        output = start;
      while (left < middle && right < end) {
        check?.();
        buffer[output++] = less(items[right]!, items[left]!)
          ? items[right++]!
          : items[left++]!;
      }
      while (left < middle) {
        check?.();
        buffer[output++] = items[left++]!;
      }
      while (right < end) {
        check?.();
        buffer[output++] = items[right++]!;
      }
    }
    [items, buffer] = [buffer, items];
    if (width > Math.floor(items.length / 2)) break;
    width *= 2;
  }
  if (items !== segments)
    for (let i = 0; i < items.length; i++) segments[i] = items[i]!;
}
export function findSharedSegmentsChecked(
  edges: Edge[],
  check: (() => void) | null,
): Segment[] {
  check?.();
  const vertical = new Map<number, Segment[]>(),
    horizontal = new Map<number, Segment[]>();
  for (const edge of edges) {
    check?.();
    for (let i = 0; i < edge.Points.length - 1; i++) {
      check?.();
      const seg = new Segment(
        edge.Points[i]!.Copy(),
        edge.Points[i + 1]!.Copy(),
      );
      if (seg.Start.X === seg.End.X && seg.Start.Y === seg.End.Y) continue;
      let groups: Map<number, Segment[]>, key: number;
      if (seg.Start.X === seg.End.X) {
        if (seg.End.Y < seg.Start.Y)
          [seg.End.Y, seg.Start.Y] = [seg.Start.Y, seg.End.Y];
        groups = vertical;
        key = seg.Start.X;
      } else if (seg.Start.Y === seg.End.Y) {
        if (seg.End.X < seg.Start.X)
          [seg.End.X, seg.Start.X] = [seg.Start.X, seg.End.X];
        groups = horizontal;
        key = seg.Start.Y;
      } else continue;
      const list = groups.get(key) ?? [];
      list.push(seg);
      groups.set(key, list);
    }
  }
  const sharedSegments: Segment[] = [];
  const add = (groups: Map<number, Segment[]>, isHorizontal: boolean) => {
    const coord = (p: Point) => (isHorizontal ? p.X : p.Y),
      set = (p: Point, n: number) => {
        if (isHorizontal) p.X = n;
        else p.Y = n;
      };
    for (const segments of groups.values()) {
      check?.();
      if (segments.length === 1) continue;
      sortSharedSegmentGroup(segments, coord, check);
      let prev = segments[0]!,
        shared: Segment | null = null;
      for (let i = 1; i < segments.length; i++) {
        check?.();
        const curr = segments[i]!;
        if (coord(prev.End) > coord(curr.Start)) {
          if (shared && coord(curr.Start) > coord(shared.End)) {
            sharedSegments.push(shared);
            shared = null;
          }
          if (!shared) {
            shared = new Segment(curr.Start.Copy(), curr.Start.Copy());
            set(shared.End, Math.min(coord(prev.End), coord(curr.End)));
          } else
            set(
              shared.End,
              Math.max(
                coord(shared.End),
                Math.min(coord(prev.End), coord(curr.End)),
              ),
            );
        } else if (shared) {
          sharedSegments.push(shared);
          shared = null;
        }
        if (coord(curr.End) > coord(prev.End)) prev = curr;
      }
      if (shared) sharedSegments.push(shared);
    }
  };
  add(vertical, false);
  add(horizontal, true);
  return sharedSegments;
}
export function labelPercentageSearchRange(
  edge: Edge,
  length: number,
): { start: number; end: number } {
  const halfHeight = edge.Label!.Height / 2,
    halfWidth = edge.Label!.Width / 2;
  if (edge.From.Cluster) {
    const p1 = edge.Points[0]!,
      p2 = edge.Points[1]!;
    if (p1.X === p2.X && Math.abs(p1.Y - p2.Y) > halfHeight)
      return {
        start: 0,
        end: Math.min(1, (Math.abs(p1.Y - p2.Y) - halfHeight) / length),
      };
    else if (Math.abs(p1.X - p2.X) > halfWidth)
      return {
        start: 0,
        end: Math.min(1, (Math.abs(p1.X - p2.X) - halfWidth) / length),
      };
  } else if (edge.To.Cluster) {
    const p1 = edge.Points[edge.Points.length - 1]!,
      p2 = edge.Points[edge.Points.length - 2]!;
    if (p1.X === p2.X && Math.abs(p1.Y - p2.Y) > halfHeight)
      return {
        start: Math.max(
          0,
          (length - Math.abs(p1.Y - p2.Y) + halfHeight) / length,
        ),
        end: 1,
      };
    else if (Math.abs(p1.X - p2.X) > halfWidth)
      return {
        start: Math.max(
          0,
          (length - Math.abs(p1.X - p2.X) + halfWidth) / length,
        ),
        end: 1,
      };
  }
  return { start: 0, end: 1 };
}
export function scoreEdgeLabelOverlaps(
  labelArea: number,
  nodeArea: number,
  nodeCount: number,
  edgeCount: number,
  almostLabelCount: number,
  labelCount: number,
  sharedCount: number,
): number {
  return (
    (nodeArea / labelArea) * 2 +
    labelCount * 10 +
    almostLabelCount +
    nodeCount * 2 +
    edgeCount * 2 +
    sharedCount
  );
}
export function scoreNodeLabelOverlaps(
  nodeCount: number,
  edgeCount: number,
  labelCount: number,
): number {
  return nodeCount + edgeCount + 2 * labelCount;
}
export function isClusterPathSharedChecked(
  edge: Edge,
  check: (() => void) | null,
): boolean {
  check?.();
  let clusterNodes,
    adjacent,
    fromCluster = false;
  if (edge.From.Cluster) {
    clusterNodes = edge.From.Cluster.Nodes;
    adjacent = edge.To;
    fromCluster = true;
  } else if (edge.To.Cluster) {
    clusterNodes = edge.To.Cluster.Nodes;
    adjacent = edge.From;
  } else return false;
  const points = edge.Points,
    p1 = points[fromCluster ? points.length - 1 : 0]!,
    p2 = points[fromCluster ? points.length - 2 : 1]!;
  for (const node of clusterNodes) {
    check?.();
    for (const other of node.Edges) {
      check?.();
      if (other === edge || node.Adjacent(other) !== adjacent) continue;
      const p = other.Points,
        o1 = p[fromCluster ? p.length - 1 : 0]!,
        o2 = p[fromCluster ? p.length - 2 : 1]!;
      if (p1.X === p2.X && o1.X === o2.X && p1.X === o1.X) {
        if (
          Math.max(p1.Y, p2.Y) >= Math.min(o1.Y, o2.Y) &&
          Math.max(o1.Y, o2.Y) >= Math.min(p1.Y, p2.Y)
        )
          return true;
      } else if (p1.Y === p2.Y && o1.Y === o2.Y && p1.Y === o1.Y) {
        if (
          Math.max(p1.X, p2.X) >= Math.min(o1.X, o2.X) &&
          Math.max(o1.X, o2.X) >= Math.min(p1.X, p2.X)
        )
          return true;
      }
    }
  }
  return false;
}
