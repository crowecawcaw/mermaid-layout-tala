// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { Orientation as O } from '../geo/orientation.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { clusterExactlyTwoExternalConnectedNodes } from './cluster.js';

export function addClusterArrangementCosts(
  node: Node,
  replacement: Node,
  adjacent: Node,
  direction: O,
  distance: number,
): number {
  const badPenalty = TurnCost(node.Graph!);
  for (const [member, external] of [
    [replacement, adjacent],
    [adjacent, replacement],
  ] as const) {
    const cluster = member.Cluster;
    if (cluster === null) continue;
    if (
      (cluster.Arrangement === 'Row' &&
        (direction === O.Left || direction === O.Right)) ||
      (cluster.Arrangement === 'Column' &&
        (direction === O.Top || direction === O.Bottom))
    )
      distance += badPenalty * 2;
    const vessel = cluster.Vessel!;
    const thisDirection = nodeOrientation(vessel, external);
    const [first, second, exactlyTwo] =
      clusterExactlyTwoExternalConnectedNodes(cluster);
    if (exactlyTwo) {
      const other = first === external ? second! : first!;
      const otherDirection = nodeOrientation(vessel, other);
      if (cluster.Arrangement === 'Row') {
        const top = [O.TopLeft, O.Top, O.TopRight],
          bottom = [O.BottomLeft, O.Bottom, O.BottomRight];
        if (
          (top.includes(otherDirection) && top.includes(thisDirection)) ||
          (bottom.includes(otherDirection) && bottom.includes(thisDirection))
        )
          distance += badPenalty;
      } else if (cluster.Arrangement === 'Column') {
        const left = [O.TopLeft, O.Left, O.BottomLeft],
          right = [O.TopRight, O.Right, O.BottomRight];
        if (
          (left.includes(otherDirection) && left.includes(thisDirection)) ||
          (right.includes(otherDirection) && right.includes(thisDirection))
        )
          distance += badPenalty;
      }
    }
    let cost = TurnCost(node.Graph!);
    if (
      cluster.Arrangement === 'Row' &&
      (thisDirection === O.Top || thisDirection === O.Bottom)
    )
      cost = Math.abs(vessel.Center().X - external.Center().X);
    else if (
      cluster.Arrangement === 'Column' &&
      (thisDirection === O.Right || thisDirection === O.Left)
    )
      cost = Math.abs(vessel.Center().Y - external.Center().Y);
    distance += cost;
  }
  return distance;
}
