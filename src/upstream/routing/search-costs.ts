// Translated routing cost helpers from internal/routing/ovg_edge_router.go
// and standalone_route_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Cluster } from '../layoutgraph/records.js';
import {
  nodeOrientation,
  boxesOverlapWithPadding,
  overlapsLine,
} from '../layoutgraph/node-spatial.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { Orientation as O } from '../geo/orientation.js';
import type { PositionedArrowheadLabel } from '../labeling/arrowhead.js';
import type { Route } from './route.js';
import type { SharingBudget } from './route-sharing.js';
export function clusterHasDesirableArrangementTo(
  cluster: Cluster,
  node: Node,
): boolean {
  let bounds = cluster.Vessel!;
  if (!cluster.Vessel?.Graph) {
    const first = cluster.Nodes[0]!,
      last = cluster.Nodes.at(-1)!,
      tl = first.TopLeft!.Copy(),
      br = last.TopLeft!.Copy();
    br.X += last.Width;
    br.Y += last.Height;
    bounds = new Node(0n, br.X - tl.X, br.Y - tl.Y);
    bounds.TopLeft = tl;
  }
  switch (nodeOrientation(bounds, node)) {
    case O.Top:
    case O.Bottom:
      return cluster.Arrangement === 'Row';
    case O.Left:
    case O.Right:
      return cluster.Arrangement === 'Column';
    default:
      return false;
  }
}
export function isUndesirableClusterArrangement(
  source: Node,
  target: Node,
): boolean {
  return !!(
    (source.Cluster &&
      !clusterHasDesirableArrangementTo(source.Cluster, target)) ||
    (target.Cluster &&
      !clusterHasDesirableArrangementTo(target.Cluster, source))
  );
}
export function positionedArrowheadLabelCostGuarded(
  positioned: PositionedArrowheadLabel,
  nodes: Node[],
  labels: PositionedArrowheadLabel[],
  routes: Route[],
  edges: Edge[],
  guard: SharingBudget,
): number {
  for (const other of labels) {
    guard.Step();
    if (
      positioned.Edge === other.Edge &&
      positioned.IsTarget === other.IsTarget
    )
      continue;
    if (positioned.Box.Overlaps(other.Box) && positioned.Text !== other.Text)
      return Infinity;
  }
  const graph = positioned.Edge.From.Graph!,
    fake = new Node(0n, positioned.Box.Width, positioned.Box.Height);
  fake.Box = positioned.Box;
  fake.Graph = graph;
  let overlapCount = 0;
  for (const node of nodes) {
    guard.Step();
    if (boxesOverlapWithPadding(fake.Box, node.Box, 5)) overlapCount++;
  }
  let penalty = 4 * TurnCost(graph) * overlapCount,
    overlapping = 0;
  for (const route of routes) {
    guard.Step();
    if (route.GEdge === positioned.Edge) continue;
    for (let i = 1; i < route.OVGNodes.length; i++) {
      guard.Step();
      if (
        overlapsLine(
          fake,
          route.OVGNodes[i - 1]!.Point,
          route.OVGNodes[i]!.Point,
          0,
        )
      ) {
        overlapping++;
        break;
      }
    }
  }
  for (const edge of edges) {
    guard.Step();
    if (edge === positioned.Edge) continue;
    for (let i = 1; i < edge.Points.length; i++) {
      guard.Step();
      if (overlapsLine(fake, edge.Points[i - 1]!, edge.Points[i]!, 0)) {
        overlapping++;
        break;
      }
    }
  }
  penalty += TurnCost(graph) * overlapping;
  return penalty;
}
