import type { Point, PositionedEdge, PositionedNode } from '../layout.js';

const horizontal = (a: Point, b: Point) => a.y === b.y;
const vertical = (a: Point, b: Point) => a.x === b.x;

function intersectionPoint(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  if (horizontal(a, b) && vertical(c, d)) return { x: d.x, y: a.y };
  if (vertical(a, b) && horizontal(c, d)) return { x: a.x, y: d.y };
  return;
}

function sameRouteDirection(a: Point, b: Point, c: Point, d: Point): boolean {
  const firstX = b.x - a.x, firstY = b.y - a.y;
  const secondX = d.x - c.x, secondY = d.y - c.y;
  return firstX * secondX + firstY * secondY > 0
    && firstX * secondY === firstY * secondX;
}

function containsPoint(node: PositionedNode, point: Point, tolerance = 1): boolean {
  const left = node.x - node.width / 2, top = node.y - node.height / 2;
  return point.x >= left - tolerance && point.x <= left + node.width + tolerance
    && point.y >= top - tolerance && point.y <= top + node.height + tolerance;
}

function entersNode(node: PositionedNode, a: Point, b: Point): boolean {
  const epsilon = 1e-6;
  const left = node.x - node.width / 2 + epsilon;
  const right = node.x + node.width / 2 - epsilon;
  const top = node.y - node.height / 2 + epsilon;
  const bottom = node.y + node.height / 2 - epsilon;
  if (horizontal(a, b)) {
    return top < a.y && a.y < bottom && Math.min(a.x, b.x) < right
      && Math.max(a.x, b.x) > left;
  }
  if (vertical(a, b)) {
    return left < a.x && a.x < right && Math.min(a.y, b.y) < bottom
      && Math.max(a.y, b.y) > top;
  }
  return true;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
}

function overlaps(a: number, b: number, c: number, d: number): boolean {
  return Math.min(a, b) <= Math.max(c, d) && Math.min(c, d) <= Math.max(a, b);
}

function straddles(first: number, second: number): boolean {
  return first === 0 || second === 0 || (first < 0) !== (second < 0);
}

/** lib/geo's closed segment-intersection rule used by the upstream stage. */
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const cs = orientation(a, b, c), ds = orientation(a, b, d);
  const as = orientation(c, d, a), bs = orientation(c, d, b);
  if (cs === 0 && ds === 0 && as === 0 && bs === 0) {
    return overlaps(a.x, b.x, c.x, d.x) && overlaps(a.y, b.y, c.y, d.y);
  }
  return straddles(cs, ds) && straddles(as, bs);
}

function descendantOf(node: PositionedNode, ancestor: PositionedNode,
  byId: ReadonlyMap<string, PositionedNode>): boolean {
  let parent = node.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    if (parent === ancestor.id) return true;
    seen.add(parent);
    parent = byId.get(parent)?.parentId;
  }
  return false;
}

function legBlocked(edge: PositionedEdge, a: Point, b: Point,
  nodes: readonly PositionedNode[], edges: readonly PositionedEdge[],
  byId: ReadonlyMap<string, PositionedNode>): boolean {
  const source = byId.get(edge.from), target = byId.get(edge.to);
  for (const node of nodes) {
    if (node.width <= 0 || node.height <= 0) continue;
    if (node !== source && node !== target
      && ((source && descendantOf(source, node, byId))
        || (target && descendantOf(target, node, byId)))) continue;
    if (entersNode(node, a, b)) return true;
  }
  for (const other of edges) {
    if (other === edge) continue;
    for (let i = 0; i < other.points.length - 1; i++) {
      if (intersects(a, b, other.points[i]!, other.points[i + 1]!)) return true;
    }
  }
  return false;
}

/** routing.simplifyPoints: remove one safe four-bend detour per pass. */
function simplifyPoints(edge: PositionedEdge, nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[], byId: ReadonlyMap<string, PositionedNode>): Point[] {
  const points = edge.points;
  if (points.length < 5) return points;
  const result = [points[0]!];
  let i = 0;
  while (i < points.length - 4) {
    const [p1, p2, p3, p4, p5] = points.slice(i, i + 5) as [Point, Point, Point, Point, Point];
    const v1x = p2.x - p1.x, v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x, v2y = p3.y - p2.y;
    const v3x = p4.x - p3.x, v3y = p4.y - p3.y;
    const v4x = p5.x - p4.x, v4y = p5.y - p4.y;
    const oppositeVerticals = vertical(p2, p3) && vertical(p4, p5)
      && (v2y > 0 && v4y < 0 || v2y < 0 && v4y > 0);
    const sameHorizontals = horizontal(p1, p2) && horizontal(p3, p4)
      && (v1x > 0 && v3x > 0 || v1x < 0 && v3x < 0);
    const oppositeHorizontals = horizontal(p2, p3) && horizontal(p4, p5)
      && (v2x > 0 && v4x < 0 || v2x < 0 && v4x > 0);
    const sameVerticals = vertical(p1, p2) && vertical(p3, p4)
      && (v1y > 0 && v3y > 0 || v1y < 0 && v3y < 0);
    const pattern = oppositeVerticals && sameHorizontals
      || oppositeHorizontals && sameVerticals;
    if (pattern) {
      const crossing = intersectionPoint(p1, p2, p4, p5);
      const source = byId.get(edge.from), target = byId.get(edge.to);
      const blocked = !crossing
        || i === 0 && source && containsPoint(source, p1)
          && !sameRouteDirection(p1, p2, p1, crossing)
        || i + 4 === points.length - 1 && target && containsPoint(target, p5)
          && !sameRouteDirection(p4, p5, crossing, p5)
        || crossing && (legBlocked(edge, p1, crossing, nodes, edges, byId)
          || legBlocked(edge, crossing, p5, nodes, edges, byId));
      if (!blocked && crossing) {
        result.push(crossing, p5);
        i += 4;
        break;
      }
    }
    result.push(p2);
    i++;
  }
  for (let j = i + 1; j < points.length; j++) result.push(points[j]!);
  return result;
}

/** Port of routing.SimplifyEdgeRoutes, leaving caller-owned records untouched. */
export function simplifyEdgeRoutes(nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[]): PositionedEdge[] {
  const copies = edges.map((edge) => ({ ...edge, points: edge.points.map((point) => ({ ...point })) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of copies) {
    for (;;) {
      const next = simplifyPoints(edge, nodes, copies, byId);
      if (next.length >= edge.points.length) break;
      edge.points = next;
    }
  }
  return copies;
}
