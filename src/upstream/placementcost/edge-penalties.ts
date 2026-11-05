// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import {
  Orientation as O,
  GetOpposite,
  IsHorizontal,
  IsVertical,
} from '../geo/orientation.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import {
  compassAxisDelta,
  compassDelta,
  depth,
  directionCompass,
  sizelessDirectionDeltaFactor,
} from './geometry.js';
import {
  edgePairKey,
  type EdgeLengthOptions,
  type EdgeLengthPreparation,
} from './edge-preparation.js';

const byteLength = (s: string): number => new TextEncoder().encode(s).length;
export function edgeDirectionAndLabelPenalty(
  node: Node,
  edge: Edge,
  replacement: Node,
  adjacent: Node,
  edgeDirection: O,
  options: EdgeLengthOptions,
  setup: EdgeLengthPreparation,
  initialDistance = 0,
): number {
  const graph = node.Graph!;
  let penalty = initialDistance,
    outer = replacement;
  if (
    replacement.Container !== adjacent.Container &&
    depth(replacement) > depth(adjacent)
  )
    outer = adjacent;
  if (
    options.PenalizeDirection &&
    (edge.IsDirected() || outer.Graph!.Direction(outer.container()) !== O.NONE)
  ) {
    const [semanticFrom, , directed] = edge.DirectedEndpoints();
    const from = directed ? semanticFrom : edge.From;
    let directionUsed =
      from === node ? GetOpposite(edgeDirection) : edgeDirection;
    if (replacement.Cluster !== null || adjacent.Cluster !== null) {
      switch (setup.direction) {
        case O.Left:
          if (directionUsed === O.TopLeft || directionUsed === O.BottomLeft)
            directionUsed = O.Left;
          break;
        case O.Right:
          if (directionUsed === O.TopRight || directionUsed === O.BottomRight)
            directionUsed = O.Right;
          break;
        case O.Top:
          if (directionUsed === O.TopLeft || directionUsed === O.TopRight)
            directionUsed = O.Top;
          break;
        case O.Bottom:
          if (directionUsed === O.BottomLeft || directionUsed === O.BottomRight)
            directionUsed = O.Bottom;
          break;
      }
    }
    const compass = directionCompass(setup.direction),
      used = directionCompass(directionUsed);
    let delta = Math.abs(compassDelta(compass, used));
    if (!edge.IsDirected())
      delta = 0.1 * delta + 0.9 * Math.abs(compassAxisDelta(compass, used));
    const base = options.IncludeNodeSizes ? graph.CellSize : 1;
    penalty +=
      setup.directionFactor * delta * base * sizelessDirectionDeltaFactor;
  }
  if (options.IncludeNodeSizes) {
    const large =
      (edge.SourceArrowheadLabel !== null &&
        byteLength(edge.SourceArrowheadLabel.Text) > 3) ||
      (edge.TargetArrowheadLabel !== null &&
        byteLength(edge.TargetArrowheadLabel.Text) > 3);
    if (large) {
      if (!IsHorizontal(edgeDirection)) penalty += 10 * TurnCost(graph);
    } else if (
      edge.Label !== null &&
      (!options.PenalizeDirection || !IsVertical(setup.direction))
    ) {
      const count =
        setup.labeledEdgeCount.get(edgePairKey(replacement, adjacent)) ?? 0;
      if (count > 2 && !IsHorizontal(edgeDirection))
        penalty += count * TurnCost(graph);
    }
  }
  return penalty;
}
