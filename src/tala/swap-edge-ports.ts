import type { Point, PositionedEdge, PositionedNode } from '../layout.js';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** The same-side branch of routing.SwapAllEdgePorts. It uncrosses the first
 * two legs at a node by exchanging two compatible ports and approach lanes. */
export function swapEdgePortsOnSameSide(nodes: readonly PositionedNode[],
  inputEdges: readonly PositionedEdge[]): PositionedEdge[] {
  const edges = inputEdges.map((edge) => ({ ...edge,
    points: edge.points.map((point) => ({ ...point })) }));
  for (const node of nodes) {
    const sides = new Map<Side, PositionedEdge[]>();
    const ports = new Map<string, PositionedEdge[]>();
    for (const edge of edges) {
      if (edge.from !== node.id && edge.to !== node.id || edge.from === edge.to
        || edge.points.length < 3 || edge.fromTableColumnIndex !== undefined
        || edge.toTableColumnIndex !== undefined) continue;
      const [first, second] = pointsAt(edge, node.id);
      const side: Side = first.x < second.x ? 'right' : first.x > second.x ? 'left'
        : first.y < second.y ? 'bottom' : 'top';
      const group = sides.get(side) ?? [];
      group.push(edge);
      sides.set(side, group);
      const key = `${first.x},${first.y}`;
      const users = ports.get(key) ?? [];
      users.push(edge);
      ports.set(key, users);
    }
    for (const [side, group] of sides) {
      const vertical = side === 'top' || side === 'bottom';
      group.sort((a, b) => {
        const [ap, , ab] = pointsAt(a, node.id);
        const [bp, , bb] = pointsAt(b, node.id);
        const primaryA = vertical ? ap.x : ap.y;
        const primaryB = vertical ? bp.x : bp.y;
        return primaryA - primaryB || (vertical ? ab.x - bb.x : ab.y - bb.y);
      });
      for (let i = 0; i + 1 < group.length; i++) {
        const first = group[i]!, second = group[i + 1]!;
        if (!edgesIntersect(first, second, node.id, side)
          || !canSwap(first, second, node.id, ports)) continue;
        const [ap, aq] = pointsAt(first, node.id);
        const [bp, bq] = pointsAt(second, node.id);
        swapCoordinate(ap, bp, vertical);
        swapCoordinate(aq, bq, vertical);
        if (clearApproaches(nodes, node.id, ap, aq, bp, bq)) {
          group[i] = second;
          group[i + 1] = first;
        } else {
          swapCoordinate(ap, bp, vertical);
          swapCoordinate(aq, bq, vertical);
        }
      }
    }
  }
  return edges;
}

function pointsAt(edge: PositionedEdge, nodeId: string): [Point, Point, Point] {
  const route = edge.points;
  return edge.from === nodeId
    ? [route[0]!, route[1]!, route[2]!]
    : [route.at(-1)!, route.at(-2)!, route.at(-3)!];
}

function edgesIntersect(first: PositionedEdge, second: PositionedEdge,
  nodeId: string, side: Side): boolean {
  const [p1, p2, p3] = pointsAt(first, nodeId);
  const [q1, q2, q3] = pointsAt(second, nodeId);
  switch (side) {
    case 'left': return p2.x < q2.x && q3.y < p1.y
      || q2.x < p2.x && p3.y > q1.y;
    case 'bottom': return p2.y > q2.y && q3.x < p1.x
      || q2.y > p2.y && p3.x > q1.x;
    case 'top': return p2.y < q2.y && q3.x < p1.x
      || q2.y < p2.y && p3.x > q1.x;
    case 'right': return p2.x > q2.x && q3.y < p1.y
      || q2.x > p2.x && p3.y > q1.y;
  }
}

function canSwap(first: PositionedEdge, second: PositionedEdge,
  nodeId: string, ports: ReadonlyMap<string, readonly PositionedEdge[]>): boolean {
  const [a] = pointsAt(first, nodeId), [b] = pointsAt(second, nodeId);
  const aUsers = ports.get(`${a.x},${a.y}`) ?? [];
  const bUsers = ports.get(`${b.x},${b.y}`) ?? [];
  if (aUsers.length === 1 && bUsers.length === 1) return true;
  const arrow = (edge: PositionedEdge): string => edge.to === nodeId
    ? edge.targetArrowhead ?? (edge.directed === false ? '' : 'triangle')
    : edge.sourceArrowhead ?? '';
  return arrow(first) === arrow(second);
}

function swapCoordinate(a: Point, b: Point, vertical: boolean): void {
  if (vertical) [a.x, b.x] = [b.x, a.x];
  else [a.y, b.y] = [b.y, a.y];
}

function clearApproaches(nodes: readonly PositionedNode[], owner: string,
  a: Point, b: Point, c: Point, d: Point): boolean {
  for (const node of nodes) {
    if (node.id === owner) continue;
    const left = node.x - node.width / 2 - 10;
    const right = node.x + node.width / 2 + 10;
    const top = node.y - node.height / 2 - 10;
    const bottom = node.y + node.height / 2 + 10;
    const intersects = (p: Point, q: Point): boolean => p.x === q.x
      ? left <= p.x && p.x <= right && Math.max(p.y, q.y) >= top
        && Math.min(p.y, q.y) <= bottom
      : top <= p.y && p.y <= bottom && Math.max(p.x, q.x) >= left
        && Math.min(p.x, q.x) <= right;
    if (intersects(a, b) || intersects(c, d)) return false;
  }
  return true;
}
