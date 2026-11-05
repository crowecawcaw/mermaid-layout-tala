// Translated bestRoute from internal/routing/ovg_edge_router.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import type { Node } from '../layoutgraph/node.js';
import type { OVGNode } from './ovg-node.js';
import type { RouteSearchWorkGuard } from './search-guard.js';
import { idealTurnAxes } from './turns.js';
export interface SearchNodeContext {
  verticalDistance: number;
  horizontalDistance: number;
}
export function bestRoute(
  ctx: Context,
  gSource: Node,
  gTarget: Node,
  source: OVGNode,
  target: OVGNode,
  contexts: (SearchNodeContext | null)[],
  vertical: (OVGNode | null)[],
  horizontal: (OVGNode | null)[],
  turnCost: number,
  guard: RouteSearchWorkGuard,
): OVGNode[] {
  guard.Bind(ctx);
  const sequence: OVGNode[] = [],
    axes = idealTurnAxes(gSource, gTarget),
    visited = new Set<OVGNode>();
  let current: OVGNode | null = target,
    previous: OVGNode | null = null,
    next: OVGNode | null = null;
  while (current) {
    guard.Step();
    if (visited.has(current)) break;
    visited.add(current);
    sequence.push(current);
    const entry = contexts[current.Index]!,
      v = entry.verticalDistance,
      h = entry.horizontalDistance;
    let isHorizontal: boolean;
    if (vertical[current.Index] && horizontal[current.Index]) {
      if (v < h) {
        next = vertical[current.Index]!;
        isHorizontal = false;
      } else {
        next = horizontal[current.Index]!;
        isHorizontal = true;
      }
    } else if (vertical[current.Index]) {
      next = vertical[current.Index]!;
      isHorizontal = false;
    } else {
      next = horizontal[current.Index] ?? null;
      isHorizontal = true;
    }
    if (
      previous &&
      next &&
      next !== source &&
      ((previous.X === current.X && isHorizontal) ||
        (previous.Y === current.Y && !isHorizontal))
    ) {
      let alternativeDistance = 0,
        alternative: OVGNode | null = null,
        multiplier = 1;
      for (const axis of axes) {
        guard.Step();
        if (Math.abs((axis.isX ? current.X : current.Y) - axis.val) <= 4) {
          multiplier = 0.98;
          break;
        }
      }
      if (
        multiplier !== 1 &&
        gSource.Cluster &&
        gSource.Cluster.Arrangement === gSource.Cluster.DesiredArrangement &&
        gSource.Cluster.Nodes.length % 2 === 0
      )
        multiplier = 0.1;
      if (
        isHorizontal &&
        PrecisionCompare(h + turnCost * multiplier, v, PRECISION) > 0
      ) {
        alternativeDistance = v;
        alternative = vertical[current.Index] ?? null;
      }
      if (
        !isHorizontal &&
        PrecisionCompare(v + turnCost * multiplier, h, PRECISION) > 0
      ) {
        alternativeDistance = h;
        alternative = horizontal[current.Index] ?? null;
      }
      if (alternative && alternativeDistance < 10_000_000) next = alternative;
    }
    previous = current;
    current = next;
  }
  for (
    let left = 0, right = sequence.length - 1;
    left < right;
    left++, right--
  ) {
    guard.Step();
    [sequence[left], sequence[right]] = [sequence[right]!, sequence[left]!];
  }
  return sequence;
}
