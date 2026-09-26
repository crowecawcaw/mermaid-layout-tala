import type { Point } from '../layout.js';
import type { OVGFlatNode } from './ovg-build.js';
import { completeFlatOVG, type OVGFlatRoutingGraph } from './ovg-finalize.js';
import type { OVGPortDirection, OVGSweepVertex } from './ovg-sweep.js';
import { TalaPriorityQueue, type TalaQueueEntry } from './priority-queue.js';

interface SearchContext {
  verticalDistance: number;
  horizontalDistance: number;
  verticalEntry?: TalaQueueEntry<OVGSweepVertex>;
  horizontalEntry?: TalaQueueEntry<OVGSweepVertex>;
}
interface TurnAxis { isX: boolean; value: number }
export interface OVGSearchResult { points: Point[]; cost: number }

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
  return searchSingleEdge(graph, sourceNode, targetNode, source, target);
}

function searchSingleEdge(graph: OVGFlatRoutingGraph, sourceNode: OVGFlatNode,
  targetNode: OVGFlatNode, source: OVGSweepVertex,
  target: OVGSweepVertex): OVGSearchResult {
  const gap = boxGap(sourceNode, targetNode);
  const maxLength = Math.max(60, gap);
  const turnCost = 0.125 * maxLength;
  const minSize = Math.min(...[sourceNode, targetNode].flatMap((n) => [n.width, n.height]));
  const nonCenterPortCost = Math.max(0.04287499999999999 * maxLength, minSize / 3);
  const overlap = gap === 0;
  const turnAxes = idealTurnAxes(sourceNode, targetNode);
  const sourcePorts = graph.ports.get(sourceNode.id) ?? [];
  const targetPorts = graph.ports.get(targetNode.id) ?? [];
  const sourceKeys = new Set(sourcePorts.map(key));
  const targetKeys = new Set(targetPorts.map(key));
  const blockedSource = new Set([...sourceKeys].filter((point) => targetKeys.has(point)));
  const blockedTarget = blockedSource;

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
      return { points: path.map((point) => ({ x: point.x, y: point.y })), cost: distance };
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
      if (adjacent !== target && current !== source
        && adjacent.x !== current.x && adjacent.y !== current.y) continue;
      if (adjacent.owners?.some((owner) => owner.node === sourceNode.id)
        && blockedSource.has(key(adjacent))) continue;

      let step: number;
      if (current === source) {
        step = 1;
        const owner = adjacent.owners?.find((item) => item.node === sourceNode.id);
        step += owner?.center ? 1 : nonCenterPortCost;
      } else {
        step = edge.distance;
      }
      if (sharesOwner(current, adjacent)) step += turnCost * 4;
      if (adjacent === target) {
        step = 1;
        const owner = current.owners?.find((item) => item.node === targetNode.id);
        if (owner) step += owner.center ? 1 : nonCenterPortCost;
      } else if (adjacent.center) {
        step = 10_000_000;
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
function key(point: Point): string { return `${point.x},${point.y}`; }
function intervalGap(a: number, ab: number, b: number, bb: number): number {
  return ab < b ? b - ab : bb < a ? a - bb : 0;
}
function boxGap(a: OVGFlatNode, b: OVGFlatNode): number {
  return Math.hypot(intervalGap(a.x, a.x + a.width, b.x, b.x + b.width),
    intervalGap(a.y, a.y + a.height, b.y, b.y + b.height));
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
