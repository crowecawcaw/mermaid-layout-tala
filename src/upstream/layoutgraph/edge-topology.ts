// Translated internal/layoutgraph/edge.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Edge } from './edge.js';
export function reconnectEdge(
  edge: Edge,
  newEndpoint: Node,
  isTo: boolean,
): void {
  if (isTo) {
    edge.To.RemoveIncidentEdge(edge);
    newEndpoint.Edges.push(edge);
    edge.To = newEndpoint;
  } else {
    edge.From.RemoveIncidentEdge(edge);
    newEndpoint.Edges.push(edge);
    edge.From = newEndpoint;
  }
}
