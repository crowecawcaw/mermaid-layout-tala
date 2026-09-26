import type { Point } from '../layout.js';
import type { OVGFlatRoutingEdge, OVGFlatRoutingGraph } from './ovg-finalize.js';
import type { OVGSweepVertex } from './ovg-sweep.js';

export interface OVGRecordedRoute<E extends { from: string; to: string }> {
  edge: E;
  nodes: OVGSweepVertex[];
}

interface Segment { from: Point; to: Point }

/** Port of ovgEdgeRouter.addRoute's occupancy indexes and ovgEdgeSet.
 * Edges are indexed once when a route is committed, then queried during the
 * next route search. */
export class OVGRouteState<E extends { from: string; to: string }> {
  readonly routes: OVGRecordedRoute<E>[] = [];
  private pointToRoutes = new Map<string, OVGRecordedRoute<E>[]>();
  private overlappingRoutes = new Map<OVGFlatRoutingEdge, OVGRecordedRoute<E>[]>();
  private nearbyEdges = new Set<OVGFlatRoutingEdge>();
  private routedSegments: Segment[] = [];
  private segmentKeys = new Set<string>();
  private verticalEdges = new Map<number, OVGFlatRoutingEdge[]>();
  private horizontalEdges = new Map<number, OVGFlatRoutingEdge[]>();

  constructor(graph: OVGFlatRoutingGraph) {
    for (const edge of graph.edgeObjects) {
      if (isVertical(edge)) push(this.verticalEdges, edge.from.x, edge);
      else if (isHorizontal(edge)) push(this.horizontalEdges, edge.from.y, edge);
    }
  }

  routesAt(point: Point): readonly OVGRecordedRoute<E>[] {
    return this.pointToRoutes.get(pointKey(point)) ?? [];
  }

  overlapping(edge: OVGFlatRoutingEdge): readonly OVGRecordedRoute<E>[] {
    return this.overlappingRoutes.get(edge) ?? [];
  }

  hasNearby(edge: OVGFlatRoutingEdge): boolean { return this.nearbyEdges.has(edge); }

  intersects(edge: OVGFlatRoutingEdge): boolean {
    for (const routed of this.routedSegments) {
      if (shareEndpoint(edge, routed)) continue;
      if (isHorizontal(edge) && isHorizontal(routed)
        && edge.from.y === routed.from.y
        && positiveOverlap(edge.from.x, edge.to.x, routed.from.x, routed.to.x)) return true;
      if (isVertical(edge) && isVertical(routed)
        && edge.from.x === routed.from.x
        && positiveOverlap(edge.from.y, edge.to.y, routed.from.y, routed.to.y)) return true;
      if (isHorizontal(edge) && isVertical(routed)
        && contains(edge.from.x, edge.to.x, routed.from.x)
        && contains(routed.from.y, routed.to.y, edge.from.y)) return true;
      if (isVertical(edge) && isHorizontal(routed)
        && contains(edge.from.y, edge.to.y, routed.from.y)
        && contains(routed.from.x, routed.to.x, edge.from.x)) return true;
    }
    return false;
  }

  addRoute(route: OVGRecordedRoute<E>): void {
    this.routes.push(route);
    for (const vertex of route.nodes) {
      const point = pointKey(vertex);
      let list = this.pointToRoutes.get(point);
      if (!list) this.pointToRoutes.set(point, list = []);
      list.push(route);
    }
    for (let i = 1; i < route.nodes.length - 2; i++) {
      const from = route.nodes[i]!, to = route.nodes[i + 1]!;
      const segment = { from, to };
      const segmentKey = `${pointKey(from)}>${pointKey(to)}`;
      if (!this.segmentKeys.has(segmentKey)) {
        this.segmentKeys.add(segmentKey);
        this.routedSegments.push(segment);
      }
      const vertical = from.x === to.x;
      const axis = vertical ? from.x : from.y;
      const begin = vertical ? from.y : from.x;
      const end = vertical ? to.y : to.x;
      const lines = vertical ? this.verticalEdges : this.horizontalEdges;
      for (const [line, edges] of lines) {
        if (Math.abs(line - axis) > 5) continue;
        for (const edge of edges) {
          const a = vertical ? edge.from.y : edge.from.x;
          const b = vertical ? edge.to.y : edge.to.x;
          if (!intervalsOverlap(begin, end, a, b)) continue;
          this.nearbyEdges.add(edge);
          if (line === axis) {
            let routes = this.overlappingRoutes.get(edge);
            if (!routes) this.overlappingRoutes.set(edge, routes = []);
            routes.push(route);
          }
        }
      }
    }
  }
}

function push(map: Map<number, OVGFlatRoutingEdge[]>, key: number,
  edge: OVGFlatRoutingEdge): void {
  let entries = map.get(key);
  if (!entries) map.set(key, entries = []);
  entries.push(edge);
}
function isVertical(edge: Segment): boolean { return edge.from.x === edge.to.x; }
function isHorizontal(edge: Segment): boolean { return edge.from.y === edge.to.y; }
function pointKey(point: Point): string { return `${point.x},${point.y}`; }
function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }
function shareEndpoint(a: Segment, b: Segment): boolean {
  return samePoint(a.from, b.from) || samePoint(a.from, b.to)
    || samePoint(a.to, b.from) || samePoint(a.to, b.to);
}
function contains(a: number, b: number, value: number): boolean {
  return Math.min(a, b) <= value && value <= Math.max(a, b);
}
function intervalsOverlap(a: number, b: number, c: number, d: number): boolean {
  return Math.max(Math.min(a, b), Math.min(c, d))
    <= Math.min(Math.max(a, b), Math.max(c, d));
}
function positiveOverlap(a: number, b: number, c: number, d: number): boolean {
  return Math.max(Math.min(a, b), Math.min(c, d))
    < Math.min(Math.max(a, b), Math.max(c, d));
}
