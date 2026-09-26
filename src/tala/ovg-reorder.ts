import type { Point } from '../layout.js';
import type { OVGFlatNode } from './ovg-build.js';
import type { OVGSequentialEdge, OVGSequentialRoute } from './ovg-search.js';

/** Flat ordinary branch of Go's reorderSelectedRoutes after flavor selection. */
export function reorderFlatOVGRoutes(nodes: readonly OVGFlatNode[],
  edges: readonly OVGSequentialEdge[], routes: OVGSequentialRoute[]): void {
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  const byEdge = new Map(edges.map((edge) => [edge.id, edge]));
  const edgeIndex = new Map(edges.map((edge, index) => [edge.id, index]));
  const grouped = new Set<OVGSequentialRoute>();
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    if (grouped.has(route)) continue;
    const bucket = [route];
    grouped.add(route);
    for (const other of routes.slice(i + 1)) {
      if (grouped.has(other)) continue;
      if (canSwap(route, other, routes, byNode, byEdge)) {
        bucket.push(other);
        grouped.add(other);
      }
    }
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => {
      const edgeA = byEdge.get(a.id)!, edgeB = byEdge.get(b.id)!;
      const from = byNode.get(edgeA.from)!, to = byNode.get(edgeA.to)!;
      const axis = orientation(from, to);
      const aPort = fromPort(a), bPort = edgeA.from === edgeB.from
        ? fromPort(b) : toPort(b);
      return axis === 'vertical' ? aPort.x - bPort.x : aPort.y - bPort.y;
    });
    const orderedEdges = bucket.map((item) => byEdge.get(item.id)!)
      .sort((a, b) => edgeIndex.get(a.id)! - edgeIndex.get(b.id)!);
    for (let index = 0; index < bucket.length; index++) {
      const current = bucket[index]!, original = byEdge.get(current.id)!;
      const next = orderedEdges[index]!;
      if (original.from !== next.from) {
        current.points.reverse();
        current.segmentPoints.reverse();
      }
      current.id = next.id;
    }
  }
}

function canSwap(a: OVGSequentialRoute, b: OVGSequentialRoute,
  all: readonly OVGSequentialRoute[], nodes: ReadonlyMap<string, OVGFlatNode>,
  edges: ReadonlyMap<string, OVGSequentialEdge>): boolean {
  const ae = edges.get(a.id)!, be = edges.get(b.id)!;
  if (ae.from === ae.to || be.from === be.to) return false;
  if (!(ae.from === be.from && ae.to === be.to
    || ae.from === be.to && ae.to === be.from)) return false;
  const axis = orientation(nodes.get(ae.from)!, nodes.get(ae.to)!);
  if (axis === 'diagonal') return false;
  if (ae.from === be.from && ae.to === be.to) {
    if (axis === 'vertical' && (fromPort(a).y !== fromPort(b).y
      || toPort(a).y !== toPort(b).y)) return false;
    if (axis === 'horizontal' && (fromPort(a).x !== fromPort(b).x
      || toPort(a).x !== toPort(b).x)) return false;
  }
  const ports = [fromPort(a), toPort(a), fromPort(b), toPort(b)];
  return all.every((other) => other === a || other === b
    || ports.every((port) => !samePoint(port, fromPort(other))
      && !samePoint(port, toPort(other))));
}

function orientation(a: OVGFlatNode, b: OVGFlatNode): 'vertical' | 'horizontal'
  | 'diagonal' | 'none' {
  const vertical = a.y + a.height < b.y || b.y + b.height < a.y;
  const horizontal = a.x + a.width < b.x || b.x + b.width < a.x;
  if (vertical && horizontal) return 'diagonal';
  if (vertical) return 'vertical';
  if (horizontal) return 'horizontal';
  return 'none';
}
function fromPort(route: OVGSequentialRoute): Point { return route.points[1]!; }
function toPort(route: OVGSequentialRoute): Point {
  return route.points[route.points.length - 2]!;
}
function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }
