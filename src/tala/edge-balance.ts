import { chooseLabelPoint } from '../route.js';
import type { Point, PositionedEdge, PositionedNode } from '../layout.js';

/** Straight two-point branch of upstream BalanceEdgeSegments. Its locked node
 * walls form an overlap corridor; evenlyDistribute uses floor(width / 2). */
export function balanceStraightSegments(nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[]): PositionedEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    if (edge.points.length !== 2 || edge.from === edge.to
      || edge.fromTableColumnIndex !== undefined || edge.toTableColumnIndex !== undefined) return edge;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to || from.shape?.toLowerCase() === 'diamond'
      || to.shape?.toLowerCase() === 'diamond') return edge;
    const [first, last] = edge.points as [Point, Point];
    let points: Point[] | undefined;
    if (first.y === last.y && first.x !== last.x) {
      const floor = Math.max(from.y - from.height / 2, to.y - to.height / 2);
      const ceil = Math.min(from.y + from.height / 2, to.y + to.height / 2);
      const balanced = floor + Math.floor((ceil - floor) / 2);
      if (ceil > floor && balanced > floor && balanced < ceil
        && first.y === Math.round((floor + ceil) / 2) && balanced !== first.y) {
        points = [{ x: first.x, y: balanced }, { x: last.x, y: balanced }];
      }
    } else if (first.x === last.x && first.y !== last.y) {
      const floor = Math.max(from.x - from.width / 2, to.x - to.width / 2);
      const ceil = Math.min(from.x + from.width / 2, to.x + to.width / 2);
      const balanced = floor + Math.floor((ceil - floor) / 2);
      if (ceil > floor && balanced > floor && balanced < ceil
        && first.x === Math.round((floor + ceil) / 2) && balanced !== first.x) {
        points = [{ x: balanced, y: first.y }, { x: balanced, y: last.y }];
      }
    }
    if (!points || intersectsOtherNode(points, nodes, from.id, to.id)) return edge;
    const point = chooseLabelPoint(points, edge, nodes);
    return { ...edge, points, x: point.x, y: point.y };
  });
}

function intersectsOtherNode(points: readonly [Point, Point] | readonly Point[],
  nodes: readonly PositionedNode[], from: string, to: string): boolean {
  const [a, b] = points;
  if (!a || !b) return false;
  for (const node of nodes) {
    if (node.id === from || node.id === to || node.isGroup) continue;
    const left = node.x - node.width / 2, right = node.x + node.width / 2;
    const top = node.y - node.height / 2, bottom = node.y + node.height / 2;
    if (a.y === b.y) {
      if (top < a.y && a.y < bottom && Math.max(Math.min(a.x, b.x), left)
        < Math.min(Math.max(a.x, b.x), right)) return true;
    } else if (left < a.x && a.x < right && Math.max(Math.min(a.y, b.y), top)
      < Math.min(Math.max(a.y, b.y), bottom)) return true;
  }
  return false;
}
