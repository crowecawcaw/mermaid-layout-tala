import { TalaGraph, TalaNode } from './graph.js';
import { compassAxisDelta, compassDelta, directionCompass, placementDistance, sizelessOrientation, type Orientation } from './placement-geometry.js';

/** Ordinary-node, non-sized branch of placementcost.NodeEdgeLength.
 * The remaining branches handle containers, clusters, nears, and sized costs. */
export function sizelessNodeEdgeLength(node: TalaNode, graph: TalaGraph): number {
  if (!node.topLeft) throw new Error(`node ${node.id} has no position`);
  const preferred = graph.directions.get(node.parent);
  const direction: Orientation = preferred === 'TB' ? 'Bottom'
    : preferred === 'BT' ? 'Top' : preferred === 'LR' ? 'Right'
    : preferred === 'RL' ? 'Left' : 'BottomRight';
  const directionFactor = preferred ? 1.5 : 0.3;
  let total = 0;
  for (const edge of node.edges) {
    const adjacent = node.adjacent(edge);
    if (!adjacent.topLeft) continue;
    let distance = placementDistance(node, adjacent, false);
    if (edge.directed || preferred) {
      const orientation = sizelessOrientation(node, adjacent);
      const edgeDirection = edge.from === node ? opposite(orientation) : orientation;
      const preferredCompass = directionCompass(direction);
      const edgeCompass = directionCompass(edgeDirection);
      let delta = Math.abs(compassDelta(preferredCompass, edgeCompass));
      if (!edge.directed) {
        delta = 0.1 * delta + 0.9 * Math.abs(compassAxisDelta(preferredCompass, edgeCompass));
      }
      distance += directionFactor * delta * 0.25;
    }
    total += distance;
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
