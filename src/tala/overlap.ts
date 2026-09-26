import type { Point } from '../layout.js';
import { ConnectedNodeGap, NodeGap } from './geometry-policy.js';
import type { TalaNode } from './graph.js';

/** Ordinary box branch of layoutgraph.Node.deltaTo. Additional margins for
 * tables, outside labels, loops, and edge minimum dimensions follow later. */
export function nodeDelta(first: TalaNode, second: TalaNode): number {
  return first.edges.some((edge) => first.adjacent(edge) === second) ? ConnectedNodeGap : NodeGap;
}

/** Port of Node.doesOverlapAt for ordinary boxes. */
export function doesOverlapAt(first: TalaNode, second: TalaNode, position: Point): boolean {
  if (!second.topLeft) return false;
  const delta = nodeDelta(first, second);
  return position.x < second.topLeft.x + second.width + delta
    && position.x + first.width + delta > second.topLeft.x
    && position.y < second.topLeft.y + second.height + delta
    && position.y + first.height + delta > second.topLeft.y;
}
