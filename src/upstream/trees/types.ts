// Translated from internal/trees/types.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
export enum TreeEdgeDirection {
  Outwards = 'Outwards',
  Inwards = 'Inwards',
  Bidirectional = 'Bidirectional',
  Undirected = 'Undirected',
}
export function treeEdgeDirection(node: Node, edge: Edge): TreeEdgeDirection {
  if (edge.IsBidirectional()) return TreeEdgeDirection.Bidirectional;
  if (edge.IsUndirected()) return TreeEdgeDirection.Undirected;
  if (edge.To === node) return TreeEdgeDirection.Inwards;
  return TreeEdgeDirection.Outwards;
}
