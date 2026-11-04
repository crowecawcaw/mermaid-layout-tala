// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { hasTableColumn } from '../layoutgraph/ports.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import {
  distanceBetweenTableColumns,
  distanceToPoint,
  placementDistance,
} from './geometry.js';
import type { EdgeRouteGeometry } from './edge-route-geometry.js';

export function edgeDistance(
  node: Node,
  adjacent: Node,
  edge: Edge,
  replacement: Node,
  adjacentReplacement: Node,
  includeSizes: boolean,
  route: EdgeRouteGeometry,
): number {
  const graph = node.Graph!;
  let distance: number;
  if (includeSizes && hasTableColumn(edge)) {
    let from = replacement,
      to = adjacentReplacement;
    if (node !== edge.From) [from, to] = [to, from];
    distance = distanceBetweenTableColumns(graph, edge, from, to);
  } else if (replacement.Cluster !== null) {
    distance = placementDistance(
      replacement.Cluster.Vessel!,
      adjacentReplacement,
      includeSizes,
    );
  } else if (adjacentReplacement.Cluster !== null) {
    distance = placementDistance(
      adjacentReplacement.Cluster.Vessel!,
      replacement,
      includeSizes,
    );
  } else if (route.isDiagonal) {
    const corner = new Point(route.nodeVal.X, route.adjacentNodeVal.Y);
    distance =
      distanceToPoint(replacement, corner, includeSizes) +
      distanceToPoint(adjacentReplacement, corner, includeSizes);
    if (includeSizes) distance += TurnCost(graph);
  } else {
    distance = placementDistance(
      replacement,
      adjacentReplacement,
      includeSizes,
    );
  }
  if (
    includeSizes &&
    node.isContainer &&
    adjacent.isContainer &&
    node.container() === adjacent.container()
  ) {
    let penalty = 0;
    if (
      Math.min(node.Width, adjacent.Width) >
        Math.max(node.Width, adjacent.Width) * 0.75 &&
      node.TopLeft!.X !== adjacent.TopLeft!.X &&
      node.TopLeft!.X + node.Width !== adjacent.TopLeft!.X + adjacent.Width &&
      (node.TopLeft!.X + node.Width) / 2 !==
        (adjacent.TopLeft!.X + adjacent.Width) / 2
    )
      penalty = TurnCost(graph);
    if (
      Math.min(node.Height, adjacent.Height) >
        Math.max(node.Height, adjacent.Height) * 0.75 &&
      node.TopLeft!.Y !== adjacent.TopLeft!.Y &&
      node.TopLeft!.Y + node.Height !== adjacent.TopLeft!.Y + adjacent.Height &&
      (node.TopLeft!.Y + node.Height) / 2 !==
        (adjacent.TopLeft!.Y + adjacent.Height) / 2
    )
      penalty = TurnCost(graph);
    distance += penalty;
  }
  return distance;
}
