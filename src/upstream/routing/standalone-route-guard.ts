// Translated from internal/routing/standalone_route_guard.go at D2 bf337903.
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
import { EuclideanDistance } from '../geo/math.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Slice } from '../gosort/slice.js';
import { orientation } from './geometry.js';
import { estimateRouteCostGuarded, routeLineGuarded } from './route-line.js';
import type { RouteWorkGuard } from './stage-guard.js';

export function tryStraightEdgeFallbackGuarded(g: Graph, edge: Edge, guard: RouteWorkGuard): void {
  guard.Step();
  const original = estimateRouteCostGuarded(g.Edges, edge, guard);
  let from, to, cost;
  try { [from, to, cost] = routeLineGuarded(g, edge, g.Edges, null, guard); }
  catch (error) { if (IsCandidateRejection(error)) return; throw error; }
  if (edge.Points.length === 4 && EuclideanDistance(edge.Points[1]!.X, edge.Points[1]!.Y, edge.Points[2]!.X, edge.Points[2]!.Y) <= 5) cost /= 4;
  guard.Step();
  if (cost < original) edge.Points = [from, to];
}
function isStraight(edge: Edge, guard: RouteWorkGuard): boolean {
  if (edge.Points.length < 2) { guard.Step(); return false; }
  let a = edge.Points[0]!, b = edge.Points[1]!;
  for (let i = 2; i < edge.Points.length; i++) {
    guard.Step();
    if (orientation(a, b, edge.Points[i]!) !== 0) return false;
    a = b; b = edge.Points[i]!;
  }
  return true;
}
function overlappingEnd(edge: Edge, guard: RouteWorkGuard): boolean {
  const start = edge.Points[0]!, end = edge.Points.at(-1)!;
  for (const other of edge.From.Edges) {
    guard.Step();
    if (other !== edge && (other.Points[0]?.Equals(start) || other.Points.at(-1)?.Equals(start))) return true;
  }
  for (const other of edge.To.Edges) {
    guard.Step();
    if (other !== edge && (other.Points[0]?.Equals(end) || other.Points.at(-1)?.Equals(end))) return true;
  }
  return false;
}
function duplicate(a: Edge, b: Edge): boolean {
  return (a.From === b.From && a.To === b.To) || (a.From === b.To && a.To === b.From);
}
function reverse(edge: Edge, guard: RouteWorkGuard): void {
  for (let left = 0, right = edge.Points.length - 1; left < right; left++, right--) {
    guard.Step();
    [edge.Points[left], edge.Points[right]] = [edge.Points[right]!, edge.Points[left]!];
  }
}
export function reorderDuplicatesInEdgesGuarded(edges: Edge[], guard: RouteWorkGuard): void {
  for (const edge of edges) {
    guard.Step();
    if (edge.FromTableColumnIndex !== null || edge.ToTableColumnIndex !== null || !edge.Label) continue;
    if (!isStraight(edge, guard)) continue;
    const overlap = overlappingEnd(edge, guard), duplicates: Edge[] = [];
    for (const other of edges) {
      guard.Step();
      if (other === edge || !duplicate(other, edge) || !isStraight(other, guard)) continue;
      if (overlap || overlappingEnd(other, guard)) {
        let source = edge.SourceArrowhead, target = edge.TargetArrowhead;
        if (other.From === edge.To) [source, target] = [target, source];
        if (other.SourceArrowhead === source && other.TargetArrowhead === target) duplicates.push(other);
      } else duplicates.push(other);
    }
    if (duplicates.length <= 1) continue;
    const start = edge.Points[0]!, end = edge.Points.at(-1)!;
    const dx = end.X - start.X, dy = end.Y - start.Y;
    const sourceOrder = [edge], targetOrder = [edge];
    for (const other of duplicates) { guard.Step(); sourceOrder.push(other); targetOrder.push(other); }
    guard.ReserveSort(sourceOrder.length); guard.ReserveSort(targetOrder.length);
    if (dy > dx) {
      Slice(sourceOrder, (a, b) => a.Points[0]!.X < b.Points[0]!.X);
      Slice(targetOrder, (a, b) => a.Points.at(-1)!.X < b.Points.at(-1)!.X);
    } else {
      Slice(sourceOrder, (a, b) => a.Points[0]!.Y < b.Points[0]!.Y);
      Slice(targetOrder, (a, b) => a.Points.at(-1)!.Y < b.Points.at(-1)!.Y);
    }
    let consistent = true;
    for (let i = 0; i < sourceOrder.length; i++) { guard.Step(); if (sourceOrder[i] !== targetOrder[i]) { consistent = false; break; } }
    if (!consistent) continue;
    let index = -1;
    for (let i = 0; i < sourceOrder.length; i++) { guard.Step(); if (sourceOrder[i] === edge) { index = i; break; } }
    if (index === 0 || index === sourceOrder.length - 1) continue;
    const first = sourceOrder[0]!, last = sourceOrder.at(-1)!;
    if (first.Label && last.Label) continue;
    guard.Step();
    const chosen = !last.Label ? last : !first.Label ? first : null;
    if (chosen) {
      [edge.Points, chosen.Points] = [chosen.Points, edge.Points];
      if (chosen.From === edge.To) { reverse(edge, guard); reverse(chosen, guard); }
    }
  }
  guard.Finish();
}
