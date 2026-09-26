import type { LayoutEdge, Point, PositionedNode } from '../layout.js';
import { shapePortPolicy, shapePorts, type PortSide } from './shape-ports.js';

const sharedPortLoopGap = 30;

interface LoopPorts {
  from: Point;
  to: Point;
  fromDirection: PortSide;
  toDirection: PortSide;
  verticalOffset: number;
  horizontalOffset: number;
  sourceArrowhead?: string;
  targetArrowhead?: string;
}

function arrowheads(edge: LayoutEdge): { source: string; target: string } {
  return {
    source: edge.sourceArrowhead ?? 'none',
    target: edge.targetArrowhead ?? (edge.sourceArrowhead !== undefined || edge.directed === false
      ? 'none' : 'triangle'),
  };
}

function hasArrowhead(value: string): boolean { return value !== '' && value !== 'none'; }

/** Direct translation of upstream loops.Route for the node's self-edges. */
export function routeNodeLoops(node: PositionedNode, edges: readonly LayoutEdge[]): Map<string, Point[]> {
  const loops = edges.filter((edge) => edge.from === node.id && edge.to === node.id);
  if (loops.length === 0) return new Map();
  const policy = shapePortPolicy(node.shape, node.numColumns);
  const ports = shapePorts(node.shape,
    { x: node.x - node.width / 2, y: node.y - node.height / 2 },
    node.width, node.height, node.numColumns);
  const closestPorts = (a: PortSide, b: PortSide): [Point, Point] => {
    let closest: [Point, Point] | undefined;
    let minimum = Infinity;
    for (const first of policy.indices[a]) for (const second of policy.indices[b]) {
      const pointA = ports[first]!, pointB = ports[second]!;
      const distance = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
      if (distance < minimum) {
        minimum = distance;
        closest = [pointA, pointB];
      }
    }
    return closest!;
  };
  const [tlLeft, tlTop] = closestPorts('left', 'top');
  const [trTop, trRight] = closestPorts('top', 'right');
  const [blBottom, blLeft] = closestPorts('bottom', 'left');
  const [brRight, brBottom] = closestPorts('right', 'bottom');
  const pairs: LoopPorts[] = [
    { from: tlLeft, to: tlTop, fromDirection: 'left', toDirection: 'top',
      verticalOffset: 0, horizontalOffset: 0 },
    { from: trTop, to: trRight, fromDirection: 'top', toDirection: 'right',
      verticalOffset: 0, horizontalOffset: 0 },
    { from: blBottom, to: blLeft, fromDirection: 'bottom', toDirection: 'left',
      verticalOffset: 0, horizontalOffset: 0 },
    { from: brRight, to: brBottom, fromDirection: 'right', toDirection: 'bottom',
      verticalOffset: 0, horizontalOffset: 0 },
  ];
  const score = (edge: LayoutEdge): number => {
    const { source, target } = arrowheads(edge);
    return hasArrowhead(source) !== hasArrowhead(target) ? 0 : hasArrowhead(source) ? 1 : 2;
  };
  const ordered = loops.sort((a, b) => score(a) - score(b)
      || (a.labelBBox?.width ?? 0) * (a.labelBBox?.height ?? 0)
      - (b.labelBBox?.width ?? 0) * (b.labelBBox?.height ?? 0));
  const routes = new Map<string, Point[]>();
  for (const edge of ordered) {
    const { source, target } = arrowheads(edge);
    const pair = pairs.find((item) => item.sourceArrowhead === source && item.targetArrowhead === target)
      ?? pairs.find((item) => item.sourceArrowhead === undefined)
      ?? pairs.find((item) => hasArrowhead(item.sourceArrowhead!) === hasArrowhead(source)
        && hasArrowhead(item.targetArrowhead!) === hasArrowhead(target));
    if (!pair) throw new Error('no loop port pair available');
    const bend = (port: Point, direction: PortSide): Point => {
      switch (direction) {
        case 'top': return { x: port.x, y: port.y - pair.verticalOffset - sharedPortLoopGap };
        case 'bottom': return { x: port.x, y: port.y + pair.verticalOffset + sharedPortLoopGap };
        case 'left': return { x: port.x - pair.horizontalOffset - sharedPortLoopGap, y: port.y };
        case 'right': return { x: port.x + pair.horizontalOffset + sharedPortLoopGap, y: port.y };
      }
    };
    const firstBend = bend(pair.from, pair.fromDirection);
    const lastBend = bend(pair.to, pair.toDirection);
    const intersection = pair.fromDirection === 'top' || pair.fromDirection === 'bottom'
      ? { x: lastBend.x, y: firstBend.y }
      : { x: firstBend.x, y: lastBend.y };
    const points = [pair.from, firstBend, intersection, lastBend, pair.to];
    routes.set(edge.id, points);
    if (points[0]!.x === points[1]!.x) {
      pair.verticalOffset = Math.abs(points[0]!.y - points[1]!.y);
      pair.horizontalOffset = Math.abs(points[4]!.x - points[3]!.x);
    } else {
      pair.verticalOffset = Math.abs(points[4]!.y - points[3]!.y);
      pair.horizontalOffset = Math.abs(points[0]!.x - points[1]!.x);
    }
    pair.verticalOffset += edge.labelBBox?.height ?? 0;
    pair.horizontalOffset += edge.labelBBox?.width ?? 0;
    pair.sourceArrowhead = source;
    pair.targetArrowhead = target;
  }
  return routes;
}

export interface LoopOffsets {
  top: number; left: number; bottom: number; right: number;
  topLeft: number; topRight: number; bottomLeft: number; bottomRight: number;
}

export function outsideTopCenterLoopLabelBox(points: readonly Point[],
  label: { width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const lengths = points.slice(1).map((point, index) => Math.hypot(
    point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (remaining <= length || i === lengths.length - 1) {
      const a = points[i]!, b = points[i + 1]!;
      const t = remaining / length;
      const baseX = a.x + (b.x - a.x) * t;
      const baseY = a.y + (b.y - a.y) * t;
      const normalX = -(a.y - b.y) / length;
      const normalY = -(b.x - a.x) / length;
      const offsetX = 1.5 + 5 + label.width / 2;
      const offsetY = 1.5 + 5 + label.height / 2;
      const chop = (value: number): number => {
        const rounded = value < 0 ? -Math.round(-Math.fround(value * 10000) / 10000)
          : Math.round(Math.fround(value * 10000) / 10000);
        return rounded === 0 ? 0 : rounded;
      };
      return { x: chop(baseX + normalX * offsetX - label.width / 2),
        y: chop(baseY + normalY * offsetY - label.height / 2),
        width: label.width, height: label.height };
    }
    remaining -= length;
  }
  throw new Error('loop route has no segments');
}

/** Upstream loops.UpdateOffsets, using a temporary node origin. */
export function computeLoopOffsets(node: PositionedNode,
  edges: readonly LayoutEdge[]): LoopOffsets | undefined {
  const routes = routeNodeLoops(node, edges);
  if (routes.size === 0) return;
  const left = node.x - node.width / 2, right = left + node.width;
  const top = node.y - node.height / 2, bottom = top + node.height;
  let minX = left, maxX = right, minY = top, maxY = bottom;
  for (const edge of edges) {
    const points = routes.get(edge.id);
    if (!points) continue;
    let routeMinX = Infinity, routeMaxX = -Infinity, routeMinY = Infinity, routeMaxY = -Infinity;
    for (const point of points) {
      routeMinX = Math.min(routeMinX, point.x);
      routeMaxX = Math.max(routeMaxX, point.x);
      routeMinY = Math.min(routeMinY, point.y);
      routeMaxY = Math.max(routeMaxY, point.y);
    }
    if (edge.labelBBox) {
      const label = outsideTopCenterLoopLabelBox(points, edge.labelBBox);
      routeMinX = Math.min(routeMinX, label.x);
      routeMaxX = Math.max(routeMaxX, label.x + label.width);
      routeMinY = Math.min(routeMinY, label.y);
      routeMaxY = Math.max(routeMaxY, label.y + label.height);
    }
    const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);
    minX = Math.min(minX, goRound(routeMinX));
    maxX = Math.max(maxX, goRound(routeMaxX));
    minY = Math.min(minY, goRound(routeMinY));
    maxY = Math.max(maxY, goRound(routeMaxY));
  }
  if (minX === left && maxX === right && minY === top && maxY === bottom) return;
  const offsets = {
    top: Math.round(top - minY), left: Math.round(left - minX),
    bottom: Math.round(maxY - bottom), right: Math.round(maxX - right),
  };
  return { ...offsets,
    topLeft: Math.max(offsets.top, offsets.left),
    topRight: Math.max(offsets.top, offsets.right),
    bottomLeft: Math.max(offsets.bottom, offsets.left),
    bottomRight: Math.max(offsets.bottom, offsets.right),
  };
}
