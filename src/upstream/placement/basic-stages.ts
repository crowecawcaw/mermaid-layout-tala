// Translated internal/placement/stages.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Kind } from '../nodeshape/kind.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { SideEdgeSpacing } from '../placementcost/geometry.js';
import { placementPadding } from './tuning.js';
export function talaFontSizes(): number[] {
  return [13, 14, 16, 20, 24, 28, 32];
}
export function scaleBasedOnEdges(node: Node): void {
  if (
    node.FixedTopLeft !== null ||
    node.DesiredWidth !== null ||
    node.DesiredHeight !== null ||
    node.IsTable() ||
    node.shapeType === Kind.Class ||
    node.Edges.length === 0
  )
    return;
  const counts = new Map<Node, number>();
  for (const edge of node.Edges) {
    const adjacent = node.Adjacent(edge);
    if (adjacent !== node)
      counts.set(adjacent, (counts.get(adjacent) ?? 0) + 1);
  }
  let total = 0,
    max = 0;
  for (const count of counts.values()) {
    total += count;
    max = Math.max(max, count);
  }
  let sides = 4;
  if (counts.size < 4) sides = counts.size;
  const average = Math.ceil(total / sides);
  const edgesPerSide = Math.max(
    max,
    Number.isFinite(average) ? average : -9223372036854775808,
  );
  if (edgesPerSide === 1) return;
  let minLength = (edgesPerSide + 1) * SideEdgeSpacing;
  if (minLength < Math.min(node.Width, node.Height)) return;
  let xRatio = 1,
    yRatio = 1;
  if (node.Shape.AspectRatio1()) {
    if (node.Width < minLength) {
      xRatio = minLength / node.Width;
      yRatio = minLength / node.Height;
      node.Width = minLength;
      node.Height = minLength;
    }
  } else {
    if (node.Width < minLength) {
      xRatio = minLength / node.Width;
      node.Width = minLength;
    }
    if (node.Height < minLength) {
      yRatio = minLength / node.Height;
      node.Height = minLength;
    }
  }
  if (node.FontSize === null) return;
  const minRatio = Math.min(xRatio, yRatio);
  let bestRatio = 1,
    fontSize = node.FontSize,
    closest = Infinity;
  for (const size of talaFontSizes()) {
    const ratio = size / node.FontSize,
      distance = Math.abs(ratio - minRatio);
    if (distance < closest) {
      fontSize = size;
      closest = distance;
      bestRatio = ratio;
    }
  }
  if (bestRatio > minRatio) {
    minLength = Math.ceil((minLength * bestRatio) / minRatio);
    if (node.Width < minLength) node.Width = minLength;
    if (node.Height < minLength) node.Height = minLength;
  }
  node.FontSize = fontSize;
  if (node.Label !== null) {
    node.Label.Width = Math.ceil(node.Label.Width * bestRatio);
    node.Label.Height = Math.ceil(node.Label.Height * bestRatio);
  }
}
export function Prescale(graph: Graph): void {
  for (const node of graph.Nodes) {
    if (node.Shape.AspectRatio1()) {
      const size = Math.max(node.Width, node.Height);
      node.Width = size;
      node.Height = size;
    }
    scaleBasedOnEdges(node);
  }
}
export function Normalize(graph: Graph): void {
  let x = Infinity,
    y = Infinity;
  if (graph.Nodes.some((node) => node.FixedTopLeft !== null)) {
    x = placementPadding;
    y = placementPadding;
  } else {
    for (const node of graph.Nodes) {
      x = Math.min(x, node.TopLeft!.X);
      y = Math.min(y, node.TopLeft!.Y);
    }
    for (const edge of graph.Edges) {
      for (const p of edge.Points) {
        x = Math.min(x, Math.floor(p.X));
        y = Math.min(y, Math.floor(p.Y));
      }
      if (edge.Label !== null) {
        const p = EdgeLabelTopLeft(
          edge,
          edge.Label.Position,
          edge.Label.Width,
          edge.Label.Height,
        )!;
        x = Math.min(x, Math.floor(p.X));
        y = Math.min(y, Math.floor(p.Y));
      }
    }
  }
  for (const node of graph.Nodes) {
    node.TopLeft!.X -= x;
    node.TopLeft!.Y -= y;
  }
  for (const edge of graph.Edges)
    for (const p of edge.Points) {
      p.X -= x;
      p.Y -= y;
    }
}
export function Pad(graph: Graph): void {
  for (const node of graph.Nodes) {
    node.TopLeft!.X += placementPadding;
    node.TopLeft!.Y += placementPadding;
  }
}
