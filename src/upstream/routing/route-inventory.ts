// Translated route inventory from internal/routing/ovg_edge_router.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import type { Route } from './route.js';
import { OVGEdge } from './ovg-edge.js';
import type { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import { OVGEdgeSet } from './ovg-edge-set.js';
import type { RouteSearchWorkGuard } from './search-guard.js';
import {
  PositionArrowheadLabel,
  type PositionedArrowheadLabel,
} from '../labeling/arrowhead.js';
import type { Edge } from '../layoutgraph/edge.js';
function nodeDebug(n: Edge['From']): string {
  return n.D2ID ?? String(n.ID);
}
function edgeDebug(edge: Edge): string {
  let arrow = '-';
  if (edge.HasSourceArrow()) arrow = '<' + arrow;
  if (edge.HasTargetArrow()) arrow += '>';
  if (!edge.HasSourceArrow() && !edge.HasTargetArrow()) arrow += '-';
  let from = nodeDebug(edge.From),
    to = nodeDebug(edge.To);
  if (edge.FromTableColumnIndex !== null)
    from += `[${edge.FromTableColumnIndex}]`;
  if (edge.ToTableColumnIndex !== null) to += `[${edge.ToTableColumnIndex}]`;
  return `${from} ${arrow} ${to}${edge.Label ? `: ${edge.Label.Text}` : ''}`;
}
export class RouteInventory {
  routes: Route[] = [];
  routedEdges: Edge[] = [];
  positionedLabels: PositionedArrowheadLabel[] = [];
  private pointToRoute = new Map<number, Map<number, Route[]>>();
  edgeSet = new OVGEdgeSet();
  hasNearbyEdge = new Set<OVGEdge>();
  overlappingRoutes = new Map<OVGEdge, Route[]>();
  constructor(
    readonly ovg: OVG,
    readonly work: RouteSearchWorkGuard,
  ) {}
  routesAt(p: Point): Route[] {
    if (Number.isNaN(p.X) || Number.isNaN(p.Y)) return [];
    return this.pointToRoute.get(p.X)?.get(p.Y) ?? [];
  }
  private appendAt(p: Point, route: Route): void {
    let y = this.pointToRoute.get(p.X);
    if (!y) {
      y = new Map();
      this.pointToRoute.set(p.X, y);
    }
    const list = y.get(p.Y) ?? [];
    list.push(route);
    y.set(p.Y, list);
  }
  findOverlappingRoutes(start: OVGNode, end: OVGNode): Route[] | null {
    const overlaps = this.edgeSet.overlappingEdgesChecked(
        new OVGEdge(start, end),
        this.work,
      ),
      found: Route[] = [],
      seen = new Set<Route>();
    for (const overlap of overlaps) {
      this.work.Step();
      for (const from of this.routesAt(overlap.From.Point)) {
        this.work.Step();
        for (const to of this.routesAt(overlap.To.Point)) {
          this.work.Step();
          if (!seen.has(to) && to === from) {
            seen.add(to);
            found.push(to);
          }
        }
      }
    }
    return found.length ? found : null;
  }
  addRoute(route: Route): void {
    const seen = new Set<OVGNode>(),
      nodes = route.GEdge.IsLoop() ? route.OVGNodes.slice(1) : route.OVGNodes;
    for (let i = 0; i < nodes.length; i++) {
      this.work.Step();
      const n = nodes[i]!;
      if (seen.has(n))
        throw new Error(
          `found duplicate OVGNode (&{X:${n.X} Y:${n.Y}}) at index ${i} in route ${edgeDebug(route.GEdge)}`,
        );
      seen.add(n);
    }
    if (route.GEdge.SourceArrowheadLabel) {
      this.work.Add(BigInt(route.OVGNodes.length));
      this.positionedLabels.push(
        PositionArrowheadLabel(
          route.GEdge,
          false,
          route.createSegmentEndpoints(),
        )!,
      );
    }
    if (route.GEdge.TargetArrowheadLabel) {
      this.work.Add(BigInt(route.OVGNodes.length));
      this.positionedLabels.push(
        PositionArrowheadLabel(
          route.GEdge,
          true,
          route.createSegmentEndpoints(),
        )!,
      );
    }
    this.routes.push(route);
    this.routedEdges.push(route.GEdge);
    for (let i = 0; i < route.OVGNodes.length; i++) {
      this.work.Step();
      const start = route.OVGNodes[i]!;
      this.appendAt(start.Point, route);
      if (i > 0 && i < route.OVGNodes.length - 2)
        this.edgeSet.addGuarded(
          new OVGEdge(start, route.OVGNodes[i + 1]!),
          this.work,
        );
    }
    if (!route.GEdge.IsInvisible)
      for (let i = 1; i < route.OVGNodes.length - 2; i++) {
        this.work.Step();
        const a = route.OVGNodes[i]!,
          b = route.OVGNodes[i + 1]!,
          vertical = a.X === b.X,
          lo = vertical ? Math.min(a.Y, b.Y) : Math.min(a.X, b.X),
          hi = vertical ? Math.max(a.Y, b.Y) : Math.max(a.X, b.X),
          coordinate = vertical ? a.X : a.Y,
          lines = vertical ? this.ovg.VerticalEdges : this.ovg.HorizontalEdges;
        for (const [axis, edges] of lines) {
          this.work.Step();
          if (Math.abs(axis - coordinate) > 5) continue;
          for (const edge of edges) {
            this.work.Step();
            const eLo = vertical
                ? Math.min(edge.From.Y, edge.To.Y)
                : Math.min(edge.From.X, edge.To.X),
              eHi = vertical
                ? Math.max(edge.From.Y, edge.To.Y)
                : Math.max(edge.From.X, edge.To.X);
            if (!(eHi < lo || hi < eLo)) {
              this.hasNearbyEdge.add(edge);
              if (axis === coordinate) {
                const matches = this.overlappingRoutes.get(edge) ?? [];
                matches.push(route);
                this.overlappingRoutes.set(edge, matches);
              }
            }
          }
        }
      }
    this.work.Check();
  }
}
