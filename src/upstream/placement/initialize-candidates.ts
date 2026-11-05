// Translated internal/placement/initialize.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Point } from '../geo/point.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../limits/optimization.js';
import { medianToNeighbors } from './metrics.js';
import { SizelessCandidates } from './sizeless-candidates.js';

export function isMajorityTarget(node: Node): boolean {
  let counter = 0;
  for (const edge of node.Edges)
    if (edge.IsDirected()) counter += edge.HasArrowTo(node) ? 1 : -1;
  return counter > 0;
}
export function nodeCandidatePositions(
  ctx: Context,
  node: Node,
  graph: Graph,
  optimizer: SizelessCandidates,
): Point[] {
  const [floatX, floatY] = medianToNeighbors(node, false, null);
  const x = Math.floor(floatX),
    y = Math.floor(floatY);
  const guard = new OptimizationWorkGuard(
    ctx,
    'sizelessOptimizer.optimize',
    MaxOptimizationWorkUnits,
  );
  const distance = optimizer.findClosestUnoccupiedDistanceGuarded(
    node,
    new Point(x, y),
    guard,
  );
  let left = x - distance - 2,
    top = y - distance - 2;
  const right = x + distance + 2,
    bottom = y + distance + 2;
  if (graph.Nodes.some((n) => n.FixedTopLeft !== null)) {
    left = Math.max(left, 0);
    top = Math.max(top, 0);
  }
  const positions: Point[] = [];
  if (isMajorityTarget(node)) {
    for (let px = right; px >= left; px--)
      for (let py = bottom; py >= top; py--) positions.push(new Point(px, py));
  } else {
    for (let px = left; px <= right; px++)
      for (let py = top; py <= bottom; py++) positions.push(new Point(px, py));
  }
  return positions;
}
