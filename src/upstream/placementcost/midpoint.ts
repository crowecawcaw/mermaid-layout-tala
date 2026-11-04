// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { SideEdgeSpacing } from './geometry.js';

export function calculateHorizontalMidpoint(
  node: Node,
  adjacent: Node,
): [number, boolean] {
  const ceil = Math.min(
    node.TopLeft!.X + node.Width,
    adjacent.TopLeft!.X + adjacent.Width,
  );
  const floor = Math.max(node.TopLeft!.X, adjacent.TopLeft!.X);
  const mid = (floor + ceil) / 2;
  const isSemiDiagonal =
    Math.abs(node.TopLeft!.X - adjacent.TopLeft!.X) > SideEdgeSpacing ||
    Math.abs(
      node.TopLeft!.X + node.Width - (adjacent.TopLeft!.X + adjacent.Width),
    ) > SideEdgeSpacing;
  return [mid, isSemiDiagonal];
}

export function calculateVerticalMidpoint(
  node: Node,
  adjacent: Node,
): [number, boolean] {
  const ceil = Math.min(
    node.TopLeft!.Y + node.Height,
    adjacent.TopLeft!.Y + adjacent.Height,
  );
  const floor = Math.max(node.TopLeft!.Y, adjacent.TopLeft!.Y);
  const mid = (floor + ceil) / 2;
  const isSemiDiagonal =
    Math.abs(node.TopLeft!.Y - adjacent.TopLeft!.Y) > SideEdgeSpacing ||
    Math.abs(
      node.TopLeft!.Y + node.Height - (adjacent.TopLeft!.Y + adjacent.Height),
    ) > SideEdgeSpacing;
  return [mid, isSemiDiagonal];
}
