// Translated internal/placement/direct.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import {
  Orientation as O,
  GetOpposite,
  IsHorizontal,
} from '../geo/orientation.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
export interface DirectionCounts {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface DirectionTransforms {
  mirrorX: boolean;
  mirrorY: boolean;
}
export function edgeDirectionCounts(edge: Edge): DirectionCounts {
  const counts = { left: 0, right: 0, top: 0, bottom: 0 },
    [from, to, directed] = edge.DirectedEndpoints();
  if (!directed) return counts;
  switch (GetOpposite(nodeOrientation(from!, to!))) {
    case O.Left:
      counts.left++;
      break;
    case O.TopLeft:
      counts.top++;
      counts.left++;
      break;
    case O.BottomLeft:
      counts.bottom++;
      counts.left++;
      break;
    case O.Right:
      counts.right++;
      break;
    case O.TopRight:
      counts.top++;
      counts.right++;
      break;
    case O.BottomRight:
      counts.bottom++;
      counts.right++;
      break;
    case O.Top:
      counts.top++;
      break;
    case O.Bottom:
      counts.bottom++;
  }
  return counts;
}
export function transformsTo(
  counts: DirectionCounts,
  direction: O,
): DirectionTransforms {
  const values = [
    { direction: O.Right, count: counts.right },
    { direction: O.Bottom, count: counts.bottom },
    { direction: O.Left, count: counts.left },
    { direction: O.Top, count: counts.top },
  ];
  values.sort(
    (a, b) =>
      b.count - a.count ||
      Number(b.direction === direction) - Number(a.direction === direction),
  );
  const primary = values[0]!;
  let secondary = values[1]!;
  if (secondary.direction === GetOpposite(primary.direction))
    secondary = values[2]!;
  if (direction === O.NONE)
    direction = IsHorizontal(primary.direction) ? O.Right : O.Bottom;
  let xDirection = O.Right,
    yDirection = O.Bottom;
  if (IsHorizontal(direction)) xDirection = direction;
  else yDirection = direction;
  const result = { mirrorX: false, mirrorY: false };
  if (IsHorizontal(primary.direction))
    result.mirrorX = primary.direction !== xDirection;
  else result.mirrorY = primary.direction !== yDirection;
  if (secondary.count > values[3]!.count) {
    if (IsHorizontal(secondary.direction))
      result.mirrorX = secondary.direction !== xDirection;
    else result.mirrorY = secondary.direction !== yDirection;
  }
  return result;
}
export function containerEdgeDirections(
  graph: Graph,
  container: Node | null,
): DirectionCounts {
  const counted = new Set<Edge>(),
    counts = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const node of graph.Containers.get(container) ?? []) {
    if (node.Graph !== graph) continue;
    for (const edge of node.Edges) {
      if (counted.has(edge)) continue;
      counted.add(edge);
      const c = edgeDirectionCounts(edge);
      counts.left += c.left;
      counts.right += c.right;
      counts.top += c.top;
      counts.bottom += c.bottom;
    }
  }
  return counts;
}
export function hasFixedDescendant(node: Node): boolean {
  if (node.FixedTopLeft !== null) return true;
  if (node.isContainer)
    for (const child of node.Graph!.Containers.get(node) ?? [])
      if (hasFixedDescendant(child)) return true;
  if (node.isClusterVessel) {
    for (const child of node.Graph!.Clusters.get(node)!.Nodes)
      if (hasFixedDescendant(child)) return true;
  } else {
    const sequence = node.Graph!.Sequences.get(node);
    if (sequence !== undefined)
      for (const child of sequence.Nodes)
        if (hasFixedDescendant(child)) return true;
  }
  return false;
}
