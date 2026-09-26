import type { LayoutDirection, LayoutEdge } from '../layout.js';
import type { TalaGraph } from './graph.js';

type Side = 'right' | 'bottom' | 'left' | 'top';
export interface PositionedBox { id: string; x: number; y: number; width: number; height: number }
export interface DirectionTransforms { mirrorX: boolean; mirrorY: boolean }
interface DirectionCounts { right: number; bottom: number; left: number; top: number }

// placement.edgeDirectionCounts: orientation is of the source relative to the
// target, and the opposite is the directed edge's travel direction.
export function edgeDirectionCounts(from: PositionedBox, to: PositionedBox): DirectionCounts {
  const counts: DirectionCounts = { right: 0, bottom: 0, left: 0, top: 0 };
  if (from.y + from.height < to.y) {
    counts.bottom++;
    if (from.x + from.width < to.x) counts.right++;
    else if (to.x + to.width < from.x) counts.left++;
  } else if (to.y + to.height < from.y) {
    counts.top++;
    if (from.x + from.width < to.x) counts.right++;
    else if (to.x + to.width < from.x) counts.left++;
  } else if (to.x + to.width < from.x) counts.left++;
  else if (from.x + from.width < to.x) counts.right++;
  return counts;
}

export function directionTransforms(nodes: readonly PositionedBox[], edges: readonly LayoutEdge[],
  direction?: LayoutDirection): DirectionTransforms {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const counts: DirectionCounts = { right: 0, bottom: 0, left: 0, top: 0 };
  for (const edge of edges) {
    if (edge.directed === false) continue;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) continue;
    const edgeCounts = edgeDirectionCounts(from, to);
    for (const side of ['right', 'bottom', 'left', 'top'] as const) counts[side] += edgeCounts[side];
  }
  const preferred: Side | undefined = direction === 'LR' ? 'right' : direction === 'RL' ? 'left'
    : direction === 'BT' ? 'top' : direction === 'TB' ? 'bottom' : undefined;
  const ordered = (['right', 'bottom', 'left', 'top'] as Side[]).sort((a, b) =>
    counts[b] - counts[a] || Number(b === preferred) - Number(a === preferred));
  const opposite = (a: Side, b: Side) => a === 'right' && b === 'left' || a === 'left' && b === 'right'
    || a === 'top' && b === 'bottom' || a === 'bottom' && b === 'top';
  const primary = ordered[0]!;
  const secondary = opposite(ordered[1]!, primary) ? ordered[2]! : ordered[1]!;
  const resolved = direction ?? (primary === 'left' || primary === 'right' ? 'LR' : 'TB');
  const xDirection: Side = resolved === 'LR' ? 'right' : resolved === 'RL' ? 'left' : 'right';
  const yDirection: Side = resolved === 'BT' ? 'top' : 'bottom';
  const transforms = { mirrorX: false, mirrorY: false };
  const select = (side: Side) => {
    if (side === 'left' || side === 'right') transforms.mirrorX = side !== xDirection;
    else transforms.mirrorY = side !== yDirection;
  };
  select(primary);
  if (counts[secondary] > counts[ordered[3]!]) select(secondary);
  return transforms;
}

/** placement.direct for an ordinary temporary subgraph. Projected edges use
 * their original descendant endpoints when counting dominant directions. */
export function directOrdinaryGraph(graph: TalaGraph, direction?: LayoutDirection): boolean {
  if (graph.nodes.some((node) => node.fixedTopLeft)) return false;
  const boxes: PositionedBox[] = [];
  const edges: LayoutEdge[] = [];
  for (const edge of graph.edges) {
    const from = graph.endpointFor(edge, 'from');
    const to = graph.endpointFor(edge, 'to');
    if (!from.topLeft || !to.topLeft) continue;
    const fromId = `${edge.id}:from`, toId = `${edge.id}:to`;
    boxes.push({ id: fromId, x: from.topLeft.x, y: from.topLeft.y,
      width: from.width, height: from.height });
    boxes.push({ id: toId, x: to.topLeft.x, y: to.topLeft.y,
      width: to.width, height: to.height });
    edges.push({ id: edge.id, from: fromId, to: toId, directed: edge.directed });
  }
  const transforms = directionTransforms(boxes, edges, direction);
  if (!transforms.mirrorX && !transforms.mirrorY) return false;
  for (const node of graph.nodes) {
    node.topLeft = {
      x: transforms.mirrorX ? -node.topLeft!.x - node.width : node.topLeft!.x,
      y: transforms.mirrorY ? -node.topLeft!.y - node.height : node.topLeft!.y,
    };
  }
  return true;
}
