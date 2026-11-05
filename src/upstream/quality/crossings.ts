// Translated from internal/quality/crossings.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Edge } from '../layoutgraph/edge.js';
import type { WorkGuard } from '../limits/work.js';
import { isNonSharedCrossing } from '../routing/cost.js';

export function countEdgeCrossings(
  edge: Edge,
  other: Edge,
  guard: WorkGuard,
): number {
  let count = 0;
  for (let i = 0; i < edge.Points.length - 1; i++) {
    guard.Step();
    for (let j = 0; j < other.Points.length - 1; j++) {
      guard.Step();
      if (isNonSharedCrossing(edge, other, i, j)) count++;
    }
  }
  return count;
}

export function countNonSharedCrossings(
  edges: Edge[],
  guard: WorkGuard,
): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    guard.Step();
    for (let j = i + 1; j < edges.length; j++) {
      guard.Step();
      count += countEdgeCrossings(edges[i]!, edges[j]!, guard);
    }
  }
  return count;
}
