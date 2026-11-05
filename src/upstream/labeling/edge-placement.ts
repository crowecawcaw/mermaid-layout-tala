// Translated from internal/labeling/placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Node } from '../layoutgraph/node.js';
import { Orientation as O } from '../geo/orientation.js';
import {
  Position as P,
  IsUnlocked,
  IsOnEdge,
  Mirrored,
  PADDING,
} from '../label/label.js';
import { edgeLabelPreferenceOrder } from './model.js';
import {
  LabelPlacementWorkGuard,
  isLabelPlacementDescendantOf,
  edgeLabelTopLeft,
  nodeOverlapArea,
  nodeOverlapCount,
  edgeOverlapCount,
  routeLengthPlacement,
  clusterLabelPlacementOrientation,
} from './guard.js';
import {
  isClusterPathSharedChecked,
  labelPercentageSearchRange,
  scoreEdgeLabelOverlaps,
} from './shared-segments.js';
export function findBestEdgeLabelPosition(
  edge: Edge,
  g: Graph,
  placed: Node[],
  shared: Node[],
  guard: LabelPlacementWorkGuard,
): [Node | null, P, number] {
  const others: Edge[] = [];
  for (const other of g.Edges) {
    guard.step();
    if (other !== edge) others.push(other);
  }
  const positions: P[] = [],
    label = edge.Label!;
  if (IsUnlocked(label.Position)) {
    if (label.Position === P.UnlockedMiddle)
      positions.push(P.UnlockedMiddle, P.UnlockedTop, P.UnlockedBottom);
    else
      positions.push(
        label.Position,
        Mirrored(label.Position),
        P.UnlockedMiddle,
      );
    positions.push(...edgeLabelPreferenceOrder);
  } else if (edge.From.Cluster || edge.To.Cluster) {
    const pathShared = isClusterPathSharedChecked(edge, () => guard.step());
    if (!pathShared)
      positions.push(
        ...edgeLabelPreferenceOrder,
        P.UnlockedTop,
        P.UnlockedBottom,
        P.UnlockedMiddle,
      );
    else {
      const fromCluster = !!edge.From.Cluster,
        cluster = fromCluster ? edge.From.Cluster! : edge.To.Cluster!,
        [orientation, index] = clusterLabelPlacementOrientation(
          fromCluster ? edge.To : edge.From,
          fromCluster ? edge.From : edge.To,
          cluster,
          guard,
        ),
        middle = (cluster.Nodes.length - 1) / 2;
      if (
        fromCluster
          ? orientation === O.Right || orientation === O.Top
          : orientation === O.Left || orientation === O.Bottom
      ) {
        if (index < middle) positions.push(P.UnlockedTop);
        else if (index > middle) positions.push(P.UnlockedBottom);
      } else if (
        fromCluster
          ? orientation === O.Left || orientation === O.Bottom
          : orientation === O.Right || orientation === O.Top
      ) {
        if (index < middle) positions.push(P.UnlockedBottom);
        else if (index > middle) positions.push(P.UnlockedTop);
      }
      positions.push(P.UnlockedMiddle, ...edgeLabelPreferenceOrder);
    }
  } else
    positions.push(
      ...edgeLabelPreferenceOrder,
      P.UnlockedTop,
      P.UnlockedBottom,
      P.UnlockedMiddle,
    );
  const ancestors: Node[] = [],
    nonAncestors: Node[] = [];
  for (const node of g.Nodes) {
    guard.step();
    const from = isLabelPlacementDescendantOf(edge.From, node, guard),
      to = isLabelPlacementDescendantOf(edge.To, node, guard);
    if (node !== edge.From && node !== edge.To && (from || to))
      ancestors.push(node);
    else nonAncestors.push(node);
  }
  let bestPosition = P.Unset,
    bestPercentage = 0,
    bestNode: Node | null = null,
    bestScore = Infinity;
  const checkPosition = (position: P) => {
    guard.step();
    const topLeft = edgeLabelTopLeft(
        edge,
        position,
        label.Width,
        label.Height,
        guard,
      ),
      fake = new Node(0n, label.Width, label.Height);
    fake.TopLeft = topLeft;
    fake.D2ID = label.Text;
    fake.Graph = g;
    fake.SetShape('Square');
    let edges = IsOnEdge(position) ? others : g.Edges;
    if (edge.From.Cluster) {
      edges = [...edges];
      for (const other of others) {
        guard.step();
        if (other.From.Cluster === edge.From.Cluster) edges.push(other);
      }
    } else if (edge.To.Cluster) {
      edges = [...edges];
      for (const other of others) {
        guard.step();
        if (other.To.Cluster === edge.To.Cluster) edges.push(other);
      }
    }
    const [ancestorArea, ancestorCount] = nodeOverlapArea(
        fake,
        ancestors,
        PADDING,
        true,
        guard,
      ),
      [nonArea, nonCount] = nodeOverlapArea(
        fake,
        nonAncestors,
        PADDING,
        false,
        guard,
      ),
      edgePadding = edgeOverlapCount(fake, edges, PADDING, guard),
      edgeExact = edgeOverlapCount(fake, edges, 0, guard),
      almostPadding = nodeOverlapCount(fake, placed, PADDING, guard),
      almostExact = nodeOverlapCount(fake, placed, 0, guard),
      labelCount = nodeOverlapCount(fake, placed, 0, guard),
      sharedCount = nodeOverlapCount(fake, shared, PADDING, guard);
    const score = scoreEdgeLabelOverlaps(
      fake.Width * fake.Height,
      ancestorArea + nonArea,
      ancestorCount + nonCount,
      edgePadding + Math.ceil(edgeExact * 0.5),
      almostPadding + Math.ceil(almostExact * 0.5),
      labelCount,
      sharedCount,
    );
    if (score < bestScore) {
      bestPosition = position;
      bestNode = fake;
      bestPercentage = edge.LabelPercentage;
      bestScore = score;
    }
  };
  let length = 0,
    calculated = false;
  for (const position of positions) {
    guard.step();
    if (bestScore === 0) break;
    if (IsUnlocked(position)) {
      if (edge.LabelPercentage !== 0) checkPosition(position);
      else {
        if (!calculated) {
          length = routeLengthPlacement(edge, guard);
          calculated = true;
        }
        const range = labelPercentageSearchRange(edge, length);
        for (let i = range.start; i < range.end; i += 0.025) {
          guard.step();
          edge.LabelPercentage = i;
          checkPosition(position);
          if (bestScore === 0) break;
        }
        edge.LabelPercentage = 0;
      }
    } else checkPosition(position);
  }
  guard.check();
  return [bestNode, bestPosition, bestPercentage];
}
