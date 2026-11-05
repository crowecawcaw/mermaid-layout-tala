// Translated from internal/labeling/arrowhead.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Box } from '../geo/box.js';
import type { Point } from '../geo/point.js';
import type { Edge } from '../layoutgraph/edge.js';
import { ArrowheadTopLeft } from '../labelgeom/arrowhead.js';
export interface PositionedArrowheadLabel {
  Box: Box;
  Edge: Edge;
  IsTarget: boolean;
  Text: string;
}
export function PositionArrowheadLabel(
  edge: Edge | null,
  isTarget: boolean,
  route: Point[],
): PositionedArrowheadLabel | null {
  if (!edge) return null;
  const value = isTarget
    ? edge.TargetArrowheadLabel
    : edge.SourceArrowheadLabel;
  if (!value) return null;
  const topLeft = ArrowheadTopLeft(
    route,
    isTarget,
    edge.SourceArrowhead,
    edge.TargetArrowhead,
    value.Width,
    value.Height,
  );
  return {
    Box: new Box(topLeft, value.Width, value.Height),
    Edge: edge,
    IsTarget: isTarget,
    Text: value.Text,
  };
}
