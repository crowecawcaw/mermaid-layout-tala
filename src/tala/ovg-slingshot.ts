import type { Point } from '../layout.js';
import type { OVGFlatEdge, OVGFlatNode } from './ovg-build.js';
import type { OVGFlatRoutingGraph } from './ovg-finalize.js';
import type { OVGRecordedRoute } from './ovg-route-state.js';
import { OVGRouteState } from './ovg-route-state.js';
import type { OVGPortDirection, OVGSweepVertex } from './ovg-sweep.js';

type Diagonal = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
export interface OVGSlingshotResult {
  routeNodes: OVGSweepVertex[];
  points: Point[];
  cost: number;
}

/** Ordinary flat branch of slingshot.go. Search stages are kept separate so
 * each can be compared to the pinned Go route generator. */
export function slingshotFlatOVG(graph: OVGFlatRoutingGraph,
  nodes: readonly OVGFlatNode[], edges: readonly OVGFlatEdge[],
  state: OVGRouteState<OVGFlatEdge>, edge: OVGFlatEdge): OVGSlingshotResult | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const source = byId.get(edge.from), target = byId.get(edge.to);
  if (!source || !target) return undefined;
  const orientation = relativeOrientation(source, target);
  if (!isDiagonal(orientation)) return undefined;
  const maxLength = Math.max(60, ...edges.map((item) =>
    boxGap(byId.get(item.from)!, byId.get(item.to)!)));
  const turnCost = 0.125 * edges.length * maxLength;
  const crossingCost = 0.48 ** 3 * edges.length * maxLength;
  const { preferred, strong } = preferLaunchingVertically(nodes, edges, source, target, orientation);
  const order = preferred ? [true, false] : [false, true];
  const result = findLShapedRoute(graph, nodes, state, source, target,
    orientation, order, preferred, strong, crossingCost);
  if (result) return { routeNodes: result.routeNodes,
    points: result.routeNodes.map((point) => ({ x: point.x, y: point.y })),
    cost: result.cost + turnCost };
  const s = findSShapedRoute(graph, nodes, state, source, target,
    orientation, order, preferred, strong, crossingCost);
  return s ? { routeNodes: s.routeNodes,
    points: s.routeNodes.map((point) => ({ x: point.x, y: point.y })),
    cost: s.cost + turnCost * 2 } : undefined;
}

function findSShapedRoute(graph: OVGFlatRoutingGraph,
  nodes: readonly OVGFlatNode[], state: OVGRouteState<OVGFlatEdge>,
  source: OVGFlatNode, target: OVGFlatNode, orientation: Diagonal,
  order: boolean[], verticalPreferred: boolean, strongPreference: boolean,
  crossingCost: number): { routeNodes: OVGSweepVertex[]; cost: number } | undefined {
  let best: { routeNodes: OVGSweepVertex[]; cost: number } | undefined;
  const turnX = sourceLeft(orientation)
    ? (source.x + source.width + target.x) / 2
    : (source.x + target.x + target.width) / 2;
  const turnY = sourceAbove(orientation)
    ? (source.y + source.height + target.y) / 2
    : (source.y + target.y + target.height) / 2;
  for (const vertical of order) {
    const sourceDirection = vertical
      ? sourceAbove(orientation) ? 'bottom' : 'top'
      : sourceLeft(orientation) ? 'right' : 'left';
    const targetDirection = vertical
      ? sourceAbove(orientation) ? 'top' : 'bottom'
      : sourceLeft(orientation) ? 'left' : 'right';
    const sourcePorts = directionalPorts(graph, source.id, sourceDirection);
    const targetPorts = directionalPorts(graph, target.id, targetDirection);
    const sourceAnchors = new Map<OVGSweepVertex, OVGSweepVertex>();
    const targetAnchors = new Map<OVGSweepVertex, OVGSweepVertex>();
    const sourceOrder: OVGSweepVertex[] = [], targetOrder: OVGSweepVertex[] = [];
    for (const port of sourcePorts) {
      let current = port;
      for (;;) {
        const next = firstFlightNeighbor(graph, current, orientation, vertical);
        if (!next || overshot(next, target, orientation, vertical, false)
          || occupiedBetween(state, source.id, target.id, current, next)) break;
        sourceAnchors.set(next, port);
        sourceOrder.push(next);
        current = next;
      }
    }
    for (const port of targetPorts) {
      let current = port;
      for (;;) {
        const next = firstFlightNeighbor(graph, current, opposite(orientation), vertical);
        if (!next || overshot(next, source, opposite(orientation), vertical, false)
          || occupiedBetween(state, source.id, target.id, current, next)) break;
        targetAnchors.set(next, port);
        targetOrder.push(next);
        current = next;
      }
    }
    sourceOrder.sort((a, b) => vertical
      ? Math.abs(a.y - turnY) - Math.abs(b.y - turnY)
      : Math.abs(a.x - turnX) - Math.abs(b.x - turnX));
    for (const sourceAnchor of sourceOrder) {
      const sourcePort = sourceAnchors.get(sourceAnchor)!;
      for (const targetAnchor of targetOrder) {
        const targetPort = targetAnchors.get(targetAnchor)!;
        if (vertical ? sourceAnchor.y !== targetAnchor.y
          : sourceAnchor.x !== targetAnchor.x) continue;
        const pairs: Array<[OVGSweepVertex, OVGSweepVertex]> = [
          [sourcePort, sourceAnchor], [sourceAnchor, targetAnchor],
          [targetAnchor, targetPort],
        ];
        let cost = 0, blocked = false;
        for (const [from, to] of pairs) {
          if (routeHitsOtherNode(nodes, source.id, target.id, from, to)) {
            blocked = true;
            break;
          }
          cost += Math.hypot(from.x - to.x, from.y - to.y);
          if (crossesBetween(state, from, to)) cost += crossingCost;
        }
        if (blocked) continue;
        if (strongPreference && vertical !== verticalPreferred) cost += crossingCost / 2;
        if (best && cost >= best.cost) continue;
        const first = fillPath(graph, sourcePort, sourceAnchor);
        const middle = fillPath(graph, sourceAnchor, targetAnchor);
        if (!first || !middle) continue;
        const check = [...middle, targetAnchor];
        if (check.slice(0, -2).some((point, i) =>
          occupiedBetween(state, source.id, target.id, point, check[i + 1]!))) continue;
        const last = fillPath(graph, targetAnchor, targetPort);
        if (!last) continue;
        const path = [graph.centers.get(source.id)!, ...first,
          ...check.slice(0, -1), ...last, targetPort,
          graph.centers.get(target.id)!];
        best = { routeNodes: path, cost };
      }
    }
  }
  return best;
}

function findLShapedRoute(graph: OVGFlatRoutingGraph,
  nodes: readonly OVGFlatNode[], state: OVGRouteState<OVGFlatEdge>,
  source: OVGFlatNode, target: OVGFlatNode, orientation: Diagonal,
  order: boolean[], verticalPreferred: boolean, strongPreference: boolean,
  crossingCost: number): { routeNodes: OVGSweepVertex[]; cost: number } | undefined {
  let best: { routeNodes: OVGSweepVertex[]; cost: number } | undefined;
  for (const vertical of order) {
    const launchDirection = vertical
      ? sourceAbove(orientation) ? 'bottom' : 'top'
      : sourceLeft(orientation) ? 'right' : 'left';
    const landingDirection = vertical
      ? sourceLeft(orientation) ? 'left' : 'right'
      : sourceAbove(orientation) ? 'top' : 'bottom';
    const launchings = directionalPorts(graph, source.id, launchDirection);
    const landings = directionalPorts(graph, target.id, landingDirection);
    for (const sourcePort of launchings) {
      let current = sourcePort;
      for (;;) {
        const next = firstFlightNeighbor(graph, current, orientation, vertical);
        if (!next || overshot(next, target, orientation, vertical, true)) break;
        if (occupiedBetween(state, source.id, target.id, current, next)) break;
        current = next;
        if (undershot(next, target, orientation, vertical)) continue;
        for (const targetPort of landings) {
          if (vertical ? next.y !== targetPort.y : next.x !== targetPort.x) continue;
          if (routeHitsOtherNode(nodes, source.id, target.id, sourcePort, next)
            || routeHitsOtherNode(nodes, source.id, target.id, targetPort, next)) continue;
          let cost = Math.hypot(sourcePort.x - next.x, sourcePort.y - next.y)
            + Math.hypot(targetPort.x - next.x, targetPort.y - next.y);
          if (crossesBetween(state, sourcePort, next)) cost += crossingCost;
          if (crossesBetween(state, next, targetPort)) cost += crossingCost;
          if (strongPreference && vertical !== verticalPreferred) cost += crossingCost / 2;
          if (best && cost >= best.cost) continue;
          const first = fillPath(graph, sourcePort, next);
          const second = fillPath(graph, next, targetPort);
          if (!first || !second) continue;
          const check = [...second, targetPort];
          if (check.slice(0, -2).some((point, i) =>
            occupiedBetween(state, source.id, target.id, point, check[i + 1]!))) continue;
          const path = [graph.centers.get(source.id)!, ...first, ...check,
            graph.centers.get(target.id)!];
          if (state.routes.some((route) => sameRoute(route, path))) continue;
          best = { routeNodes: path, cost };
        }
      }
    }
  }
  return best;
}

function directionalPorts(graph: OVGFlatRoutingGraph, owner: string,
  direction: OVGPortDirection): OVGSweepVertex[] {
  const seen = new Set<OVGSweepVertex>();
  const result: OVGSweepVertex[] = [];
  for (const port of graph.ports.get(owner) ?? []) {
    if (seen.has(port)) continue;
    seen.add(port);
    if (port.owners?.find((item) => item.node === owner)?.directions.includes(direction)) {
      result.push(port);
    }
  }
  return result;
}

function firstFlightNeighbor(graph: OVGFlatRoutingGraph, from: OVGSweepVertex,
  orientation: Diagonal, vertical: boolean): OVGSweepVertex | undefined {
  for (const edge of graph.incident.get(from) ?? []) {
    const next = edge.from === from ? edge.to : edge.from;
    if (vertical) {
      if (next.x === from.x && (sourceAbove(orientation) ? next.y > from.y : next.y < from.y)) {
        return next;
      }
    } else if (next.y === from.y
      && (sourceLeft(orientation) ? next.x > from.x : next.x < from.x)) return next;
  }
  return undefined;
}

function fillPath(graph: OVGFlatRoutingGraph, from: OVGSweepVertex,
  to: OVGSweepVertex): OVGSweepVertex[] | undefined {
  const result = [from];
  let current = from;
  const limit = graph.vertices.length + 1;
  for (let i = 0; i < limit; i++) {
    let next: OVGSweepVertex | undefined;
    for (const edge of graph.incident.get(current) ?? []) {
      const adjacent = edge.from === current ? edge.to : edge.from;
      if (from.x === to.x && adjacent.x === current.x
        && (from.y < to.y ? adjacent.y > current.y : adjacent.y < current.y)
        || from.y === to.y && adjacent.y === current.y
          && (from.x < to.x ? adjacent.x > current.x : adjacent.x < current.x)) {
        next = adjacent;
        break;
      }
    }
    if (!next) return undefined;
    if (next === to) return result;
    result.push(next);
    current = next;
  }
  return undefined;
}

function undershot(point: Point, target: OVGFlatNode,
  orientation: Diagonal, vertical: boolean): boolean {
  if (vertical) return sourceAbove(orientation)
    ? point.y < target.y : point.y > target.y + target.height;
  return sourceLeft(orientation)
    ? point.x < target.x : point.x > target.x + target.width;
}
function overshot(point: Point, target: OVGFlatNode,
  orientation: Diagonal, vertical: boolean, lRoute: boolean): boolean {
  if (vertical) return sourceAbove(orientation)
    ? point.y > target.y + (lRoute ? target.height : 0)
    : point.y < target.y + (lRoute ? 0 : target.height);
  return sourceLeft(orientation)
    ? point.x > target.x + (lRoute ? target.width : 0)
    : point.x < target.x + (lRoute ? 0 : target.width);
}

function occupiedBetween(state: OVGRouteState<OVGFlatEdge>, source: string,
  target: string, from: Point, to: Point): boolean {
  const overlaps = state.routes.filter((route) => routeSegments(route).some(([a, b]) =>
    colinearOverlap(from, to, a, b)));
  if (!overlaps.length) return false;
  const allEdges = [{ from: source, to: target }, ...overlaps.map((route) => route.edge)];
  const ids = [source, target, ...overlaps.flatMap((route) => [route.edge.from, route.edge.to])];
  return !ids.some((id) => allEdges.every((edge) => edge.from === id || edge.to === id));
}
function routeSegments(route: OVGRecordedRoute<OVGFlatEdge>): Array<[Point, Point]> {
  const result: Array<[Point, Point]> = [];
  for (let i = 1; i < route.nodes.length - 2; i++) {
    result.push([route.nodes[i]!, route.nodes[i + 1]!]);
  }
  return result;
}
function colinearOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
      <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
      <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
  }
  return false;
}
function crossesBetween(state: OVGRouteState<OVGFlatEdge>, from: OVGSweepVertex,
  to: OVGSweepVertex): boolean {
  return state.intersects({ from, to, distance: Math.hypot(from.x - to.x, from.y - to.y) });
}
function sameRoute(route: OVGRecordedRoute<OVGFlatEdge>, path: OVGSweepVertex[]): boolean {
  if (route.nodes.length !== path.length) return false;
  if (!samePoint(route.nodes[1]!, path[1]!)
    || !samePoint(route.nodes[route.nodes.length - 2]!, path[path.length - 2]!)) return false;
  for (let i = 2; i < path.length - 2; i++) if (!samePoint(route.nodes[i]!, path[i]!)) return false;
  return true;
}
function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }

function routeHitsOtherNode(nodes: readonly OVGFlatNode[], source: string, target: string,
  from: Point, to: Point): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const isAncestor = (ancestor: string, child: string): boolean => {
    for (let id: string | undefined = child; id; id = byId.get(id)?.parentId) {
      if (id === ancestor) return true;
    }
    return false;
  };
  return nodes.some((node) => !isAncestor(node.id, source)
    && !isAncestor(node.id, target) && segmentIntersectsBox(node, from, to));
}
function segmentIntersectsBox(node: OVGFlatNode, from: Point, to: Point): boolean {
  if (from.x === to.x) return node.x <= from.x && from.x <= node.x + node.width
    && Math.max(from.y, to.y) >= node.y && Math.min(from.y, to.y) <= node.y + node.height;
  if (from.y === to.y) return node.y <= from.y && from.y <= node.y + node.height
    && Math.max(from.x, to.x) >= node.x && Math.min(from.x, to.x) <= node.x + node.width;
  return false;
}

function preferLaunchingVertically(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[], source: OVGFlatNode, target: OVGFlatNode,
  orientation: Diagonal): { preferred: boolean; strong: boolean } {
  const verticalSource: string[] = sourceAbove(orientation)
    ? sourceLeft(orientation) ? ['bottomLeft', 'bottom'] : ['bottomRight', 'bottom']
    : sourceLeft(orientation) ? ['topLeft', 'top'] : ['topRight', 'top'];
  const verticalTarget: string[] = sourceLeft(orientation)
    ? sourceAbove(orientation) ? ['left', 'bottomLeft'] : ['left', 'topLeft']
    : sourceAbove(orientation) ? ['right', 'bottomRight'] : ['right', 'topRight'];
  const horizontalSource: string[] = sourceLeft(orientation)
    ? sourceAbove(orientation) ? ['topRight', 'right'] : ['bottomRight', 'right']
    : sourceAbove(orientation) ? ['topLeft', 'left'] : ['bottomLeft', 'left'];
  const horizontalTarget: string[] = sourceAbove(orientation)
    ? sourceLeft(orientation) ? ['top', 'topRight'] : ['top', 'topLeft']
    : sourceLeft(orientation) ? ['bottom', 'bottomRight'] : ['bottom', 'bottomLeft'];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let vertical = 0, horizontal = 0;
  for (const edge of edges) {
    const sourceNeighbor = edge.from === source.id ? edge.to
      : edge.to === source.id ? edge.from : undefined;
    if (sourceNeighbor && sourceNeighbor !== target.id) {
      const node = byId.get(sourceNeighbor)!;
      const o = relativeOrientation(node, source);
      if (verticalSource.includes(o)) vertical++;
      if (horizontalSource.includes(o)) horizontal++;
    }
    const targetNeighbor = edge.from === target.id ? edge.to
      : edge.to === target.id ? edge.from : undefined;
    if (targetNeighbor && targetNeighbor !== source.id) {
      const node = byId.get(targetNeighbor)!;
      const o = relativeOrientation(node, target);
      if (verticalTarget.includes(o)) vertical++;
      else if (horizontalTarget.includes(o)) horizontal++;
    }
  }
  if (vertical === horizontal) {
    return { preferred: nodes.indexOf(source) < nodes.indexOf(target), strong: false };
  }
  return { preferred: vertical < horizontal, strong: true };
}

function relativeOrientation(a: OVGFlatNode, b: OVGFlatNode): string {
  const left = a.x + a.width < b.x, right = b.x + b.width < a.x;
  const top = a.y + a.height < b.y, bottom = b.y + b.height < a.y;
  if (top) return left ? 'topLeft' : right ? 'topRight' : 'top';
  if (bottom) return left ? 'bottomLeft' : right ? 'bottomRight' : 'bottom';
  return left ? 'left' : right ? 'right' : 'none';
}
function isDiagonal(value: string): value is Diagonal {
  return value === 'topLeft' || value === 'topRight'
    || value === 'bottomLeft' || value === 'bottomRight';
}
function sourceAbove(value: Diagonal): boolean {
  return value === 'topLeft' || value === 'topRight';
}
function sourceLeft(value: Diagonal): boolean {
  return value === 'topLeft' || value === 'bottomLeft';
}
function opposite(value: Diagonal): Diagonal {
  switch (value) {
    case 'topLeft': return 'bottomRight';
    case 'topRight': return 'bottomLeft';
    case 'bottomLeft': return 'topRight';
    case 'bottomRight': return 'topLeft';
  }
}
function boxGap(a: OVGFlatNode, b: OVGFlatNode): number {
  const dx = a.x + a.width < b.x ? b.x - a.x - a.width
    : b.x + b.width < a.x ? a.x - b.x - b.width : 0;
  const dy = a.y + a.height < b.y ? b.y - a.y - a.height
    : b.y + b.height < a.y ? a.y - b.y - b.height : 0;
  return Math.hypot(dx, dy);
}
