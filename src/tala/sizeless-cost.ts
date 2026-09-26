import { TalaGraph, TalaNode } from './graph.js';
import { compassDelta, directionCompass, placementDistance, sizelessOrientation, type Orientation } from './placement-geometry.js';

/** Ordinary-node, non-sized branch of placementcost.NodeEdgeLength.
 * The remaining branches handle containers, clusters, nears, and sized costs. */
export function sizelessNodeEdgeLength(node: TalaNode, graph: TalaGraph): number {
  if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
  const preferred = graph.directions.get(node.parent) ?? 'TB';
  const direction: Orientation = preferred === 'TB' ? 'Bottom'
    : preferred === 'BT' ? 'Top' : preferred === 'LR' ? 'Right' : 'Left';
  const directionFactor = 1.5;
  let total = 0;
  for (const edge of node.edges) {
    const adjacent = node.adjacent(edge);
    if (!adjacent.topLeft) continue;
    const orientation = sizelessOrientation(node, adjacent);
    const directed = edge.from === node ? opposite(orientation) : orientation;
    const delta = Math.abs(compassDelta(directionCompass(direction), directionCompass(directed)));
    total += placementDistance(node, adjacent, false) + directionFactor * delta * 0.25;
  }
  return total;
}

function opposite(orientation: Orientation): Orientation {
  switch (orientation) {
    case 'Top': return 'Bottom';
    case 'TopRight': return 'BottomLeft';
    case 'Right': return 'Left';
    case 'BottomRight': return 'TopLeft';
    case 'Bottom': return 'Top';
    case 'BottomLeft': return 'TopRight';
    case 'Left': return 'Right';
    case 'TopLeft': return 'BottomRight';
    default: return 'NONE';
  }
}
