// Translated from internal/routing/shortcut_routes.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Box } from '../geo/box.js';
import type { Point } from '../geo/point.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Edge } from '../layoutgraph/edge.js';
import { Node } from '../layoutgraph/node.js';
import { LabelTopLeft, IconSize } from '../layoutgraph/node-geometry.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { Kind } from '../nodeshape/kind.js';
import { Position } from '../label/label.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import type { RouteWorkGuard } from './stage-guard.js';
import { changedRouteIsClear } from './balance-segments.js';
import { orthogonalSegmentEntersNode } from './edge-simplify.js';
import {
  shortcutEpsilon,
  shortcutOrthogonal,
  shortcutBends,
  shortcutLength,
  shortcutSegmentsMeet,
  shortcutContactsPreserved,
} from './shortcut-geometry.js';
const spacing = 40;
const coordinate = (p: Point, horizontal: boolean) => (horizontal ? p.X : p.Y);
export function shortcutWallClearance(
  g: Graph,
  before: Point[],
  a: Point,
  b: Point,
  guard: RouteWorkGuard,
): boolean {
  const horizontal = a.Y === b.Y,
    position = coordinate(a, !horizontal),
    lo = Math.min(coordinate(a, horizontal), coordinate(b, horizontal)),
    hi = Math.max(coordinate(a, horizontal), coordinate(b, horizontal));
  for (const n of g.Nodes) {
    guard.Step();
    const nlo = coordinate(n.TopLeft!, horizontal),
      nhi = nlo + (horizontal ? n.Width : n.Height),
      wall = horizontal ? n.TopLeft!.Y : n.TopLeft!.X,
      walls = [wall, wall + (horizontal ? n.Height : n.Width)];
    if (Math.min(hi, nhi) - Math.max(lo, nlo) <= shortcutEpsilon) continue;
    for (const wall of walls) {
      const gap = Math.abs(position - wall);
      if (gap >= spacing - shortcutEpsilon) continue;
      let minimum = spacing;
      for (let j = 1; j < before.length; j++) {
        guard.Step();
        const u = before[j - 1]!,
          v = before[j]!,
          old = coordinate(u, !horizontal);
        if (
          old !== coordinate(v, !horizontal) ||
          (old - wall) * (position - wall) < 0
        )
          continue;
        const oldLo = Math.min(
            coordinate(u, horizontal),
            coordinate(v, horizontal),
          ),
          oldHi = Math.max(
            coordinate(u, horizontal),
            coordinate(v, horizontal),
          );
        if (Math.min(oldHi, nhi) - Math.max(oldLo, nlo) > shortcutEpsilon)
          minimum = Math.min(minimum, Math.abs(old - wall));
      }
      if (gap + shortcutEpsilon < minimum) return false;
    }
  }
  return true;
}
export function shortcutParallelClearance(
  g: Graph,
  e: Edge,
  a: Point,
  b: Point,
  guard: RouteWorkGuard,
): boolean {
  const horizontal = a.Y === b.Y,
    position = coordinate(a, !horizontal),
    lo = Math.min(coordinate(a, horizontal), coordinate(b, horizontal)),
    hi = Math.max(coordinate(a, horizontal), coordinate(b, horizontal));
  for (const other of g.Edges) {
    if (other === e) continue;
    for (let j = 1; j < other.Points.length; j++) {
      guard.Step();
      const c = other.Points[j - 1]!,
        d = other.Points[j]!,
        wall = coordinate(c, !horizontal);
      if (wall !== coordinate(d, !horizontal)) continue;
      const otherLo = Math.min(
          coordinate(c, horizontal),
          coordinate(d, horizontal),
        ),
        otherHi = Math.max(
          coordinate(c, horizontal),
          coordinate(d, horizontal),
        );
      if (Math.min(hi, otherHi) - Math.max(lo, otherLo) <= shortcutEpsilon)
        continue;
      const gap = Math.abs(position - wall);
      if (gap <= shortcutEpsilon || gap >= spacing - shortcutEpsilon) continue;
      let minimum = spacing;
      for (let k = 1; k < e.Points.length; k++) {
        guard.Step();
        const u = e.Points[k - 1]!,
          v = e.Points[k]!,
          old = coordinate(u, !horizontal);
        if (old !== coordinate(v, !horizontal)) continue;
        const oldLo = Math.min(
            coordinate(u, horizontal),
            coordinate(v, horizontal),
          ),
          oldHi = Math.max(
            coordinate(u, horizontal),
            coordinate(v, horizontal),
          ),
          oldGap = Math.abs(old - wall);
        if (
          oldGap > shortcutEpsilon &&
          Math.min(oldHi, otherHi) - Math.max(oldLo, otherLo) > shortcutEpsilon
        )
          minimum = Math.min(minimum, oldGap);
      }
      if (gap + shortcutEpsilon < minimum) return false;
    }
  }
  return true;
}
export function shortcutCandidateSafe(
  g: Graph,
  e: Edge,
  points: Point[],
  labels: Box[],
  guard: RouteWorkGuard,
): boolean {
  if (
    !shortcutOrthogonal(points) ||
    shortcutBends(points) >= shortcutBends(e.Points) ||
    shortcutLength(points) > shortcutLength(e.Points) + shortcutEpsilon
  )
    return false;
  const candidate = Object.assign(new Edge(e.From, e.To), e);
  candidate.Points = points;
  if (!changedRouteIsClear(g, candidate, e.Points, true, guard)) return false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      length = Math.abs(b.X - a.X) + Math.abs(b.Y - a.Y);
    let minimum = spacing,
      unchanged = false;
    for (let j = 1; j < e.Points.length; j++) {
      guard.Step();
      unchanged ||= a.Equals(e.Points[j - 1]!) && b.Equals(e.Points[j]!);
    }
    if (i === 1)
      minimum = Math.min(minimum, shortcutLength(e.Points.slice(0, 2)));
    if (i === points.length - 1)
      minimum = Math.min(minimum, shortcutLength(e.Points.slice(-2)));
    if (!unchanged && length + shortcutEpsilon < minimum) return false;
    for (let j = i + 2; j < points.length; j++) {
      guard.Step();
      if (shortcutSegmentsMeet(a, b, points[j - 1]!, points[j]!)) return false;
    }
    if (unchanged) continue;
    for (const box of labels) {
      guard.Step();
      const n = new Node(0n, box.Width, box.Height);
      n.Box = box;
      if (orthogonalSegmentEntersNode(n, a, b)) return false;
    }
    if (
      !shortcutWallClearance(g, e.Points, a, b, guard) ||
      !shortcutParallelClearance(g, e, a, b, guard)
    )
      return false;
  }
  for (const other of g.Edges) {
    if (other === e) continue;
    if (!shortcutContactsPreserved(e.Points, points, other.Points, guard))
      return false;
  }
  return true;
}
export function shortcutLabelBoxes(g: Graph, guard: RouteWorkGuard): Box[] {
  const boxes: Box[] = [];
  for (const n of g.Nodes) {
    guard.Add(BigInt(1 + 4 * g.Nodes.length));
    if (n.IsInvisible) continue;
    if (n.Label && n.Label.Position !== Position.Unset)
      boxes.push(
        new Box(
          LabelTopLeft(n, n.Label.Position, n.Label.Width, n.Label.Height),
          n.Label.Width,
          n.Label.Height,
        ),
      );
    if (n.Icon && n.shapeType !== Kind.Image) {
      const size = IconSize(n, n.Icon.Position);
      boxes.push(
        new Box(LabelTopLeft(n, n.Icon.Position, size, size), size, size),
      );
    }
  }
  for (const e of g.Edges) {
    guard.Add(BigInt(1 + 3 * e.Points.length));
    if (e.IsInvisible || e.Points.length < 2) continue;
    if (e.Label && e.Label.Position !== Position.Unset)
      boxes.push(
        new Box(
          EdgeLabelTopLeft(e, e.Label.Position, e.Label.Width, e.Label.Height)!,
          e.Label.Width,
          e.Label.Height,
        ),
      );
    if (e.SourceArrowheadLabel)
      boxes.push(PositionArrowheadLabel(e, false, e.Points)!.Box);
    if (e.TargetArrowheadLabel)
      boxes.push(PositionArrowheadLabel(e, true, e.Points)!.Box);
  }
  return boxes;
}
