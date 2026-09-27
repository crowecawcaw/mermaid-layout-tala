import type { Point } from '../layout.js';
import type { OVGFlatEdge, OVGFlatNode } from './ovg-build.js';
import { completeFlatOVG, type OVGFlatRoutingGraph } from './ovg-finalize.js';
import type { OVGPortDirection, OVGSweepVertex } from './ovg-sweep.js';
import { ovgPortGroups } from './ovg-candidates.js';
import { shapePortPolicy } from './shape-ports.js';
import { TalaPriorityQueue, type TalaQueueEntry } from './priority-queue.js';
import { OVGRouteState, type OVGRecordedRoute } from './ovg-route-state.js';
import { slingshotFlatOVG } from './ovg-slingshot.js';
import { reorderFlatOVGRoutes } from './ovg-reorder.js';

interface SearchContext {
  verticalDistance: number;
  horizontalDistance: number;
  verticalEntry?: TalaQueueEntry<OVGSweepVertex>;
  horizontalEntry?: TalaQueueEntry<OVGSweepVertex>;
}
interface TurnAxis { isX: boolean; value: number }
export interface OVGSearchResult { points: Point[]; cost: number }
export interface OVGSequentialEdge extends OVGFlatEdge { id: string }
export interface OVGSequentialRoute extends OVGSearchResult { id: string; segmentPoints: Point[] }
export type OVGRouteFlavor = 'ShortestToLongest' | 'LongestToShortest' | 'Default'
  | 'TopDownLeftRight';
export interface OVGFlavorResult { flavor: OVGRouteFlavor;
  routes: OVGSequentialRoute[]; totalCost: number }
type RouteRecord = OVGRecordedRoute<OVGFlatEdge>;
interface SearchInternal extends OVGSearchResult { routeNodes: OVGSweepVertex[] }

/** The ordinary, unoccupied-route branch of ovg_edge_router.go search.
 * This entry point is for differential validation before the route coordinator
 * and its shared-route rules are translated. */
export function searchFlatOVGSingleEdge(nodes: readonly OVGFlatNode[],
  fromId: string, toId: string): OVGSearchResult {
  const graph = completeFlatOVG(nodes, [{ from: fromId, to: toId }]);
  const sourceNode = nodes.find((node) => node.id === fromId);
  const targetNode = nodes.find((node) => node.id === toId);
  const source = graph.centers.get(fromId), target = graph.centers.get(toId);
  if (!sourceNode || !targetNode || !source || !target) throw new Error('unknown route endpoint');
  const routeState = new OVGRouteState<OVGFlatEdge>(graph);
  const result = searchSingleEdge(graph, nodes, [{ from: fromId, to: toId }], routeState,
    sourceNode, targetNode, { from: fromId, to: toId }, source, target);
  return { points: result.points, cost: result.cost };
}

export function searchFlatOVGSequential(nodes: readonly OVGFlatNode[],
  edges: readonly OVGSequentialEdge[]): OVGSequentialRoute[] {
  return routeSequential(nodes, edges, false);
}

export function generateFlatOVGRoutes(nodes: readonly OVGFlatNode[],
  edges: readonly OVGSequentialEdge[], flavor: OVGRouteFlavor = 'ShortestToLongest'
): OVGSequentialRoute[] {
  return routeSequential(nodes, edges, true, flavor);
}

/** Go's ordinary route coordinator tries three stable edge orders and chooses
 * the first one within geometric precision of the minimum total cost. */
export function generateBestFlatOVGRoutes(nodes: readonly OVGFlatNode[],
  edges: readonly OVGSequentialEdge[]): OVGFlavorResult {
  const graph = completeFlatOVG(nodes, edges);
  let best: OVGFlavorResult | undefined;
  let lastError: unknown;
  for (const flavor of ['ShortestToLongest', 'LongestToShortest', 'Default'] as const) {
    let routes: OVGSequentialRoute[];
    try { routes = routeSequential(nodes, edges, true, flavor, graph); }
    catch (error) { lastError = error; continue; }
    const totalCost = routes.reduce((sum, route) => sum + route.cost, 0);
    if (!best || best.totalCost - totalCost >= 0.0001) {
      best = { flavor, routes, totalCost };
    }
  }
  if (!best) throw lastError ?? new Error('no OVG route flavor succeeded');
  reorderFlatOVGRoutes(nodes, edges, best.routes);
  return best;
}

function routeSequential(nodes: readonly OVGFlatNode[],
  edges: readonly OVGSequentialEdge[], useSlingshot: boolean,
  flavor: OVGRouteFlavor = 'ShortestToLongest',
  graph: OVGFlatRoutingGraph = completeFlatOVG(nodes, edges)): OVGSequentialRoute[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const distanceOrder = (a: OVGSequentialEdge, b: OVGSequentialEdge): number => {
    const aFrom = byId.get(a.from)!, aTo = byId.get(a.to)!;
    const bFrom = byId.get(b.from)!, bTo = byId.get(b.to)!;
    return edgeSortDistance(aFrom, aTo) - edgeSortDistance(bFrom, bTo);
  };
  const ordered = [...edges];
  if (flavor === 'ShortestToLongest') ordered.sort(distanceOrder);
  else if (flavor === 'LongestToShortest') ordered.sort((a, b) => distanceOrder(b, a));
  else if (flavor === 'TopDownLeftRight') ordered.sort((a, b) => {
    let af = byId.get(a.from)!, at = byId.get(a.to)!;
    let bf = byId.get(b.from)!, bt = byId.get(b.to)!;
    if (af.y > at.y) [af, at] = [at, af];
    if (bf.y > bt.y) [bf, bt] = [bt, bf];
    if (af.y !== bf.y) return af.y - bf.y;
    if (af !== bf) return af.x - bf.x;
    if (at.y === bt.y) return at.x - bt.x;
    return at.y - bt.y;
  });
  const routeState = new OVGRouteState<OVGFlatEdge>(graph);
  return ordered.map((edge) => {
    const from = byId.get(edge.from)!, to = byId.get(edge.to)!;
    const slingshot = useSlingshot
      ? slingshotFlatOVG(graph, nodes, edges, routeState, edge) : undefined;
    const result = slingshot ?? searchSingleEdge(graph, nodes, edges, routeState, from, to,
      edge, graph.centers.get(from.id)!, graph.centers.get(to.id)!);
    routeState.addRoute({ edge, nodes: result.routeNodes });
    return { id: edge.id, points: result.points, cost: result.cost,
      segmentPoints: createSegmentEndpoints(result.routeNodes) };
  });
}

/** Go Route.createSegmentEndpoints: discard center nodes and retain turns. */
export function createSegmentEndpoints(path: readonly Point[]): Point[] {
  if (path.length < 3) throw new Error('OVG route has no endpoint ports');
  const points: Point[] = [copyPoint(path[1]!)];
  for (let i = 2; i < path.length - 2; i++) {
    const previous = path[i - 1]!, current = path[i]!, next = path[i + 1]!;
    if (current.x === previous.x && current.x !== next.x
      || current.y === previous.y && current.y !== next.y) points.push(copyPoint(current));
  }
  points.push(copyPoint(path[path.length - 2]!));
  return points;
}

function copyPoint(point: Point): Point { return { x: point.x, y: point.y }; }

function searchSingleEdge(graph: OVGFlatRoutingGraph,
  nodes: readonly OVGFlatNode[], edges: readonly OVGFlatEdge[],
  routeState: OVGRouteState<OVGFlatEdge>, sourceNode: OVGFlatNode,
  targetNode: OVGFlatNode, currentEdge: OVGFlatEdge, source: OVGSweepVertex,
  target: OVGSweepVertex): SearchInternal {
  const gap = boxGap(sourceNode, targetNode);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const descendantOf = (nodeId: string | undefined, ancestorId: string | undefined): boolean => {
    if (!nodeId || !ancestorId) return false;
    for (let id: string | undefined = nodeId; id; id = byId.get(id)?.parentId) {
      if (id === ancestorId) return true;
    }
    return false;
  };
  const sourceContainer = sourceNode.parentId;
  const targetContainer = targetNode.parentId;
  const endpointsRelated = descendantOf(sourceNode.id, targetNode.id)
    || descendantOf(targetNode.id, sourceNode.id);
  const maxLength = Math.max(60, ...edges.map((edge) =>
    boxGap(byId.get(edge.from)!, byId.get(edge.to)!)));
  const turnCost = 0.125 * edges.length * maxLength;
  const crossingCost = 0.48 * 0.48 * 0.48 * edges.length * maxLength;
  const minSize = Math.min(...nodes.flatMap((n) => [n.width, n.height]));
  const nonCenterPortCost = Math.max(0.04287499999999999 * edges.length * maxLength,
    minSize / 3);
  const overlap = gap === 0;
  const turnAxes = idealTurnAxes(sourceNode, targetNode);
  const sourcePorts = graph.ports.get(sourceNode.id) ?? [];
  const targetPorts = graph.ports.get(targetNode.id) ?? [];
  const sourceKeys = new Set(sourcePorts.map(key));
  const targetKeys = new Set(targetPorts.map(key));
  const blockedSource = new Set([...sourceKeys].filter((point) => targetKeys.has(point)));
  const blockedTarget = blockedSource;
  const usedSource = new Set<string>(), usedTarget = new Set<string>();
  const duplicateSource = new Set<string>(), duplicateTarget = new Set<string>();
  for (const route of routeState.routes) {
    if (route.edge.from === sourceNode.id && route.edge.to === targetNode.id) {
      duplicateSource.add(key(route.nodes[1]!));
      duplicateTarget.add(key(route.nodes[route.nodes.length - 2]!));
    }
    for (const routeNode of route.nodes) {
      if (routeNode.owners?.some((owner) => owner.node === sourceNode.id)) {
        usedSource.add(key(routeNode));
      }
      if (routeNode.owners?.some((owner) => owner.node === targetNode.id)) {
        usedTarget.add(key(routeNode));
      }
    }
  }
  const symmetricalSource = symmetricalPortKeys(sourceNode, usedSource);
  const symmetricalTarget = symmetricalPortKeys(targetNode, usedTarget);

  const contexts = new Map<OVGSweepVertex, SearchContext>();
  const verticalHops = new Map<OVGSweepVertex, OVGSweepVertex>();
  const horizontalHops = new Map<OVGSweepVertex, OVGSweepVertex>();
  contexts.set(source, { verticalDistance: Infinity, horizontalDistance: Infinity });
  const queue = new TalaPriorityQueue<OVGSweepVertex>();
  queue.push(0, source, false);
  queue.push(0, source, true);

  while (!queue.empty()) {
    const entry = queue.pop();
    const current = entry.node;
    const fromHorizontal = entry.isHorizontal;
    const distance = entry.priority;
    if (current === target) {
      const path = bestRoute(source, target, contexts, verticalHops, horizontalHops,
        turnAxes, turnCost);
      return { points: path.map((point) => ({ x: point.x, y: point.y })),
        cost: distance, routeNodes: path };
    }
    const last = (fromHorizontal ? horizontalHops : verticalHops).get(current);
    for (const edge of graph.incident.get(current) ?? []) {
      const adjacent = edge.from === current ? edge.to : edge.from;
      if (adjacent === last) continue;
      const sourcePort = current.owners?.find((owner) => owner.node === sourceNode.id);
      if (sourcePort && !someDirection(sourcePort.directions, (direction) =>
        validPortStep(direction, current, adjacent, overlap))) continue;
      const targetPort = adjacent.owners?.find((owner) => owner.node === targetNode.id);
      if (targetPort) {
        if (blockedTarget.has(key(adjacent))) continue;
        if (!someDirection(targetPort.directions, (direction) =>
          validPortStep(direction, adjacent, current, overlap))) continue;
      }
      if (current !== source && adjacent !== target
        && !adjacent.owners?.some((owner) => owner.node === sourceNode.id
          || owner.node === targetNode.id)
        && adjacent.containerId
        && !descendantOf(sourceContainer, adjacent.containerId)
        && !descendantOf(targetContainer, adjacent.containerId)) continue;
      if (adjacent !== target && current !== source
        && adjacent.x !== current.x && adjacent.y !== current.y) continue;
      if (adjacent.owners?.some((owner) => owner.node === sourceNode.id)
        && blockedSource.has(key(adjacent))) continue;

      let step: number;
      if (current === source) {
        step = duplicateSource.has(key(adjacent)) ? 10_000_000 : 1;
        const owner = adjacent.owners?.find((item) => item.node === sourceNode.id);
        step += owner?.center
          ? symmetricalSource.has(key(adjacent)) ? 0 : 1 : nonCenterPortCost;
      } else {
        step = edge.distance;
      }
      if (sourceContainer && sourceContainer === targetContainer && !endpointsRelated
        && adjacent.containerId !== sourceContainer
        && current.containerId !== adjacent.containerId) step += turnCost * 4;
      if (sharesOwner(current, adjacent)) step += turnCost * 4;
      if (adjacent === target) {
        step = duplicateTarget.has(key(current)) ? 10_000_000 : 1;
        const owner = current.owners?.find((item) => item.node === targetNode.id);
        if (owner) step += owner.center
          ? symmetricalTarget.has(key(current)) ? 0 : 1 : nonCenterPortCost;
      } else if (adjacent.center) {
        step = 10_000_000;
      } else {
        const onCurrent = current !== source && current !== target
          ? routeState.routesAt(current) : [];
        const onAdjacent = current !== source && current !== target
          ? routeState.routesAt(adjacent).length > 0 : false;
        const overlapped = current !== source && current !== target
          ? routeState.overlapping(edge) : [];
        const prohibited = overlapped.some((route) => adjacent.tunnel
          && isEntireColinear(route.nodes, adjacent, current))
          || overlapped.length > 0 && !canOverlapRoutes(
          currentEdge, overlapped)
          || current !== source && !onCurrent.length && !onAdjacent
            && routeState.hasNearby(edge);
        if (prohibited) {
          step = 10_000_000;
        } else {
          const crossing = onCurrent.length > 0 && !onAdjacent
            && !canOverlapRoutes(currentEdge, onCurrent)
            || current !== source && routeState.intersects(edge);
          if (crossing) step += crossingCost;
        }
      }

      if (last && adjacent !== target && current !== source && last !== source) {
        const turns = !fromHorizontal && adjacent.x !== current.x
          || fromHorizontal && adjacent.y !== current.y;
        if (turns) {
          const multiplier = turnMultiplier(adjacent, turnAxes);
          step += turnCost * multiplier;
          if (distanceToBox(current, targetNode) <= 20) step += turnCost;
          if (distanceToBox(current, sourceNode) <= 20) step += turnCost;
        }
      }
      if (current !== source && adjacent !== target
        && (adjacent.nearPortOwners?.includes(sourceNode.id)
          || adjacent.nearPortOwners?.includes(targetNode.id))) step += 1;

      const maybe = distance + step;
      let context = contexts.get(adjacent);
      if (!context) {
        context = { verticalDistance: Infinity, horizontalDistance: Infinity };
        contexts.set(adjacent, context);
      }
      const horizontal = adjacent.y === current.y;
      const previous = horizontal ? context.horizontalDistance : context.verticalDistance;
      if (maybe >= previous) continue;
      const hops = horizontal ? horizontalHops : verticalHops;
      const oldHop = hops.get(adjacent);
      if (oldHop) queue.push(horizontal
        ? contexts.get(oldHop)!.horizontalDistance : contexts.get(oldHop)!.verticalDistance,
      oldHop, horizontal);
      const queued = horizontal ? context.horizontalEntry : context.verticalEntry;
      if (!queued) {
        const pushed = queue.push(maybe, adjacent, horizontal);
        if (horizontal) context.horizontalEntry = pushed;
        else context.verticalEntry = pushed;
      } else {
        queue.decrease(queued, maybe);
      }
      if (horizontal) context.horizontalDistance = maybe;
      else context.verticalDistance = maybe;
      hops.set(adjacent, current);
    }
  }
  throw new Error('OVG path not found');
}

function bestRoute(source: OVGSweepVertex, target: OVGSweepVertex,
  contexts: Map<OVGSweepVertex, SearchContext>,
  verticalHops: Map<OVGSweepVertex, OVGSweepVertex>,
  horizontalHops: Map<OVGSweepVertex, OVGSweepVertex>,
  axes: TurnAxis[], turnCost: number): OVGSweepVertex[] {
  const sequence: OVGSweepVertex[] = [];
  const visited = new Set<OVGSweepVertex>();
  let current: OVGSweepVertex | undefined = target;
  let previous: OVGSweepVertex | undefined;
  while (current && !visited.has(current)) {
    visited.add(current);
    sequence.push(current);
    const context = contexts.get(current)!;
    const vertical = verticalHops.get(current);
    const horizontal = horizontalHops.get(current);
    let next: OVGSweepVertex | undefined;
    let isHorizontal = false;
    if (vertical && horizontal) {
      if (context.verticalDistance < context.horizontalDistance) next = vertical;
      else { next = horizontal; isHorizontal = true; }
    } else if (vertical) next = vertical;
    else { next = horizontal; isHorizontal = true; }
    if (previous && next && next !== source && (previous.x === current.x && isHorizontal
      || previous.y === current.y && !isHorizontal)) {
      const multiplier = turnMultiplier(current, axes);
      let alternative: OVGSweepVertex | undefined;
      let alternativeDistance = Infinity;
      if (isHorizontal && context.horizontalDistance + turnCost * multiplier
        > context.verticalDistance + 1e-9) {
        alternative = vertical;
        alternativeDistance = context.verticalDistance;
      }
      if (!isHorizontal && context.verticalDistance + turnCost * multiplier
        > context.horizontalDistance + 1e-9) {
        alternative = horizontal;
        alternativeDistance = context.horizontalDistance;
      }
      if (alternative && alternativeDistance < 10_000_000) next = alternative;
    }
    previous = current;
    current = next;
  }
  return sequence.reverse();
}

function someDirection(directions: OVGPortDirection[],
  accept: (direction: OVGPortDirection) => boolean): boolean {
  return (directions.length ? directions : ['none' as const]).some(accept);
}

function validPortStep(direction: OVGPortDirection, port: Point,
  other: Point, overlap: boolean): boolean {
  if (overlap) {
    if (direction === 'top' || direction === 'bottom') return port.y !== other.y;
    if (direction === 'left' || direction === 'right') return port.x !== other.x;
    return true;
  }
  switch (direction) {
    case 'top': return other.y < port.y;
    case 'bottom': return other.y > port.y;
    case 'left': return other.x < port.x;
    case 'right': return other.x > port.x;
    default: return true;
  }
}

function sharesOwner(a: OVGSweepVertex, b: OVGSweepVertex): boolean {
  return Boolean(a.owners?.some((owner) => b.owners?.some((other) => other.node === owner.node)));
}
function canOverlapRoutes(edge: OVGFlatEdge,
  routes: readonly RouteRecord[]): boolean {
  if (!routes.length) return true;
  const arrowheads = (item: OVGFlatEdge): string =>
    `${item.sourceArrowhead ?? ''}\0${item.targetArrowhead
      ?? (item.directed ? 'triangle' : '')}`;
  const currentArrowheads = arrowheads(edge);
  if (edge.directed || edge.targetArrowhead) return routes.every((route) =>
    (route.edge.directed || route.edge.targetArrowhead)
    && arrowheads(route.edge) === currentArrowheads
    && (edge.from === route.edge.from || edge.to === route.edge.to));
  if (routes.some((route) => route.edge.directed || route.edge.targetArrowhead
    || arrowheads(route.edge) !== currentArrowheads)) return false;
  const all = [edge, ...routes.map((route) => route.edge)];
  return [edge.from, edge.to, ...routes.flatMap((route) =>
    [route.edge.from, route.edge.to])]
    .some((node) => all.every((item) => item.from === node || item.to === node));
}
function isEntireColinear(route: readonly OVGSweepVertex[], from: Point, to: Point): boolean {
  const horizontal = from.y === to.y, vertical = from.x === to.x;
  if (!horizontal && !vertical) return false;
  const min = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
  const max = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
  for (let i = 1; i < route.length - 2; i++) {
    const a = route[i]!, b = route[i + 1]!;
    if (horizontal ? a.y !== from.y || b.y !== from.y
      : a.x !== from.x || b.x !== from.x) return false;
    const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    if (low < min || high > max) return false;
  }
  return true;
}
function key(point: Point): string { return `${point.x},${point.y}`; }
function symmetricalPortKeys(node: OVGFlatNode, used: ReadonlySet<string>): Set<string> {
  const ports = ovgPortGroups(node).flat();
  const mirrors = shapePortPolicy(node.shape, node.numColumns).mirrors ?? {};
  const result = new Set<string>();
  for (const [index, mirrored] of Object.entries(mirrors)) {
    if (mirrored === undefined) continue;
    const point = ports[Number(index)], mirror = ports[mirrored];
    if (point && mirror && used.has(key(mirror))) result.add(key(point));
  }
  return result;
}
function intervalGap(a: number, ab: number, b: number, bb: number): number {
  return ab < b ? b - ab : bb < a ? a - bb : 0;
}
function boxGap(a: OVGFlatNode, b: OVGFlatNode): number {
  return Math.hypot(intervalGap(a.x, a.x + a.width, b.x, b.x + b.width),
    intervalGap(a.y, a.y + a.height, b.y, b.y + b.height));
}
function edgeSortDistance(a: OVGFlatNode, b: OVGFlatNode): number {
  const centerX = Math.abs((a.x + a.width / 2) - (b.x + b.width / 2)) / (a.width + b.width);
  const centerY = Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) / (a.height + b.height);
  return boxGap(a, b) + 0.05 * Math.min(centerX, centerY);
}
function distanceToBox(point: Point, box: OVGFlatNode): number {
  return Math.hypot(Math.max(box.x - point.x, point.x - box.x - box.width, 0),
    Math.max(box.y - point.y, point.y - box.y - box.height, 0));
}
function idealTurnAxes(a: OVGFlatNode, b: OVGFlatNode): TurnAxis[] {
  const left = b.x + b.width < a.x, right = a.x + a.width < b.x;
  const top = b.y + b.height < a.y, bottom = a.y + a.height < b.y;
  const axes: TurnAxis[] = [];
  if (left) axes.push({ isX: true, value: (a.x + b.x + b.width) / 2 });
  else if (right) axes.push({ isX: true, value: (b.x + a.x + a.width) / 2 });
  if (top) axes.push({ isX: false, value: (a.y + b.y + b.height) / 2 });
  else if (bottom) axes.push({ isX: false, value: (b.y + a.y + a.height) / 2 });
  return axes;
}
function turnMultiplier(point: Point, axes: TurnAxis[]): number {
  return axes.some((axis) => Math.abs((axis.isX ? point.x : point.y) - axis.value) <= 4)
    ? 0.98 : 1;
}
