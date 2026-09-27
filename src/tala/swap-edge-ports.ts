import type { Point, PositionedEdge, PositionedNode } from '../layout.js';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Port of routing.SwapAllEdgePorts for ordinary orthogonal routes. */
export function swapAllEdgePorts(nodes: readonly PositionedNode[],
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
    const topBottom = [...sides.get('top') ?? [], ...sides.get('bottom') ?? []];
    const leftRight = [...sides.get('left') ?? [], ...sides.get('right') ?? []];
    for (const a of topBottom) for (const b of leftRight) {
      if (a.points.length <= 2) break;
      if (b.points.length <= 2 || !canSwap(a, b, node.id, ports)) continue;
      const [a1, a2, a3] = pointsAt(a, node.id);
      const [b1, b2, b3] = pointsAt(b, node.id);
      const intersection = orthogonalIntersection(a2, a3, b2, b3);
      if (!intersection) continue;
      const aBefore = a.points.map((point) => ({ ...point }));
      const bBefore = b.points.map((point) => ({ ...point }));
      swapPoints(a1, b1); swapPoints(a2, b2);
      const aInsert = { ...intersection };
      a.points.splice(a.from === node.id ? 2 : a.points.length - 2, 0, aInsert);
      if (aInsert.x === a2.x) { aInsert.x += 2.5; a2.x += 2.5; }
      else { aInsert.y -= 2.5; a2.y -= 2.5; }
      const bInsert = { ...intersection };
      b.points.splice(b.from === node.id ? 2 : b.points.length - 2, 0, bInsert);
      if (bInsert.x === b2.x) { bInsert.x += 2.5; b2.x += 2.5; }
      else { bInsert.y -= 2.5; b2.y -= 2.5; }
      const aImproved = refineAfterAdjacentSwap(nodes, a);
      const bImproved = refineAfterAdjacentSwap(nodes, b);
      if (!aImproved && !bImproved) {
        a.points = aBefore; b.points = bBefore;
      }
    }
  }
  return edges;
}

function orthogonalIntersection(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const between = (value: number, first: number, last: number) =>
    Math.min(first, last) <= value && value <= Math.max(first, last);
  if (a.y === b.y && c.x === d.x && between(c.x, a.x, b.x)
    && between(a.y, c.y, d.y)) return { x: c.x, y: a.y };
  if (a.x === b.x && c.y === d.y && between(a.x, c.x, d.x)
    && between(c.y, a.y, b.y)) return { x: a.x, y: c.y };
  return undefined;
}

function swapPoints(a: Point, b: Point): void {
  [a.x, b.x] = [b.x, a.x];
  [a.y, b.y] = [b.y, a.y];
}

function refineAfterAdjacentSwap(nodes: readonly PositionedNode[], edge: PositionedEdge): boolean {
  if (edge.from === edge.to || edge.points.length <= 2
    || edge.fromTableColumnIndex !== undefined || edge.toTableColumnIndex !== undefined) return false;
  // Go attempts a straight tunnel first for complete three- and four-point
  // routes. The safe local S-to-L rewrite applies to a longer first section.
  if (edge.points.length <= 4) return false;
  const first = edge.points.slice(0, 4);
  if (isUShaped(first)) return false;
  const bend = first[0]!.x === first[1]!.x
    ? { x: first[1]!.x, y: first[3]!.y }
    : { x: first[3]!.x, y: first[1]!.y };
  if (!clearRefinement(nodes, edge, first[0]!, bend, first[3]!)) return false;
  edge.points.splice(1, 3, bend);
  return true;
}

function isUShaped(points: readonly Point[]): boolean {
  if (points.length !== 4) return false;
  if (points[0]!.x === points[1]!.x) return points[1]!.y === points[2]!.y
    && Math.sign(points[0]!.y - points[1]!.y)
      === Math.sign(points[3]!.y - points[2]!.y);
  return points[1]!.x === points[2]!.x
    && Math.sign(points[0]!.x - points[1]!.x)
      === Math.sign(points[3]!.x - points[2]!.x);
}

function clearRefinement(nodes: readonly PositionedNode[], edge: PositionedEdge,
  a: Point, bend: Point, d: Point): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentOfEndpoint = (containerId: string, endpointId: string): boolean => {
    for (let id = byId.get(endpointId)?.parentId; id; id = byId.get(id)?.parentId)
      if (id === containerId) return true;
    return false;
  };
  for (const node of nodes) {
    if (node.id === edge.from || node.id === edge.to
      || parentOfEndpoint(node.id, edge.from) || parentOfEndpoint(node.id, edge.to)) continue;
    const left = node.x - node.width / 2 - 10, right = node.x + node.width / 2 + 10;
    const top = node.y - node.height / 2 - 10, bottom = node.y + node.height / 2 + 10;
    const blocked = (p: Point, q: Point): boolean => p.x === q.x
      ? left <= p.x && p.x <= right && Math.max(p.y, q.y) >= top
        && Math.min(p.y, q.y) <= bottom
      : top <= p.y && p.y <= bottom && Math.max(p.x, q.x) >= left
        && Math.min(p.x, q.x) <= right;
    if (blocked(a, bend) || blocked(bend, d)) return false;
  }
  return true;
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
