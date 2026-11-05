import { goStableSort } from '../../stable-sort.js';
// Translated internal/loops/loops.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Orientation as O, IsVertical } from '../geo/orientation.js';
import { EuclideanDistance, Round } from '../geo/math.js';
import { Position } from '../label/label.js';
import { ports } from '../layoutgraph/ports.js';
import { boundingBoxValues } from '../layoutgraph/node-geometry.js';
import { edgeBoundingBoxValues } from '../layoutgraph/graph-bounds.js';
const sharedPortLoopGap = 30;
interface LoopPorts {
  verticalOffset: number;
  horizontalOffset: number;
  hasSource: boolean | null;
  hasTarget: boolean | null;
  source: string;
  target: string;
  from: Point;
  fromDirection: O;
  to: Point;
  toDirection: O;
}
function newLoopPorts(
  from: Point,
  to: Point,
  fromDirection: O,
  toDirection: O,
): LoopPorts {
  return {
    verticalOffset: 0,
    horizontalOffset: 0,
    hasSource: null,
    hasTarget: null,
    source: '',
    target: '',
    from,
    fromDirection,
    to,
    toDirection,
  };
}
export function ComputeOffsets(graph: Graph): void {
  for (const node of graph.Nodes) UpdateOffsets(node);
}
export function UpdateOffsets(node: Node): void {
  const wasNil = node.TopLeft === null;
  if (wasNil) node.TopLeft = new Point(0, 0);
  computeOffsets(node);
  if (wasNil) node.TopLeft = null;
}
function computeOffsets(node: Node): void {
  node.LoopOffsets = new Map();
  const [tl, br] = boundingBoxValues(node, null, true),
    [loopTL, loopBR] = boundingBoxValues(node, null, true);
  for (const edge of Route(node)) {
    if (!edge.IsLoop()) continue;
    const [et, eb] = edgeBoundingBoxValues(edge);
    loopTL.X = Math.min(loopTL.X, et.X);
    loopTL.Y = Math.min(loopTL.Y, et.Y);
    loopBR.X = Math.max(loopBR.X, eb.X);
    loopBR.Y = Math.max(loopBR.Y, eb.Y);
    edge.Points = [];
  }
  if (tl.Equals(loopTL) && br.Equals(loopBR)) return;
  const m = node.LoopOffsets;
  m.set(O.Left, Round(Math.abs(tl.X - loopTL.X)));
  m.set(O.Right, Round(Math.abs(br.X - loopBR.X)));
  m.set(O.Top, Round(Math.abs(tl.Y - loopTL.Y)));
  m.set(O.Bottom, Round(Math.abs(br.Y - loopBR.Y)));
  m.set(O.TopLeft, Math.max(m.get(O.Top)!, m.get(O.Left)!));
  m.set(O.TopRight, Math.max(m.get(O.Top)!, m.get(O.Right)!));
  m.set(O.BottomLeft, Math.max(m.get(O.Bottom)!, m.get(O.Left)!));
  m.set(O.BottomRight, Math.max(m.get(O.Bottom)!, m.get(O.Right)!));
}
export function edgesInOrder(edges: Edge[]): Edge[] {
  const sorted = [...edges],
    score = (e: Edge): number =>
      e.HasSourceArrow() !== e.HasTargetArrow()
        ? 0
        : e.HasSourceArrow()
          ? 1
          : 2;
  goStableSort(sorted, (a, b) => {
    if (
      a.HasSourceArrow() !== b.HasSourceArrow() ||
      a.HasTargetArrow() !== b.HasTargetArrow()
    )
      return score(a) - score(b);
    const aa = a.Label === null ? 0 : a.Label.Width * a.Label.Height,
      bb = b.Label === null ? 0 : b.Label.Width * b.Label.Height;
    return aa < bb ? -1 : bb < aa ? 1 : 0;
  });
  return sorted;
}
function closestPorts(all: Point[], a: number[], b: number[]): [Point, Point] {
  let first = new Point(0, 0),
    second = new Point(0, 0),
    min = Infinity;
  for (const i of a)
    for (const j of b) {
      const p = all[i]!,
        q = all[j]!,
        d = EuclideanDistance(p.X, p.Y, q.X, q.Y);
      if (d < min) {
        min = d;
        first = p.Copy();
        second = q.Copy();
      }
    }
  return [first, second];
}
function makeLoopPorts(node: Node): LoopPorts[] {
  const all = ports(node),
    top = node.Shape.PortIndices(O.Top),
    right = node.Shape.PortIndices(O.Right),
    bottom = node.Shape.PortIndices(O.Bottom),
    left = node.Shape.PortIndices(O.Left);
  const [trTop, trRight] = closestPorts(all, top, right),
    [blBottom, blLeft] = closestPorts(all, bottom, left),
    [ltLeft, ltTop] = closestPorts(all, left, top),
    [brRight, brBottom] = closestPorts(all, right, bottom);
  return [
    newLoopPorts(ltLeft, ltTop, O.Left, O.Top),
    newLoopPorts(trTop, trRight, O.Top, O.Right),
    newLoopPorts(blBottom, blLeft, O.Bottom, O.Left),
    newLoopPorts(brRight, brBottom, O.Right, O.Bottom),
  ];
}
function findLoopPortsForEdge(edge: Edge, available: LoopPorts[]): LoopPorts {
  for (const p of available)
    if (
      p.hasSource !== null &&
      p.hasTarget !== null &&
      p.source === edge.SourceArrowhead &&
      p.target === edge.TargetArrowhead
    )
      return p;
  for (const p of available)
    if (p.hasSource === null && p.hasTarget === null) return p;
  for (const p of available)
    if (
      p.hasSource !== null &&
      p.hasTarget !== null &&
      p.hasSource === edge.HasSourceArrow() &&
      p.hasTarget === edge.HasTargetArrow()
    )
      return p;
  return null!;
}
function bend(
  port: Point,
  direction: O,
  vertical: number,
  horizontal: number,
): Point {
  switch (direction) {
    case O.Top:
      return new Point(port.X, port.Y - vertical - sharedPortLoopGap);
    case O.Bottom:
      return new Point(port.X, port.Y + vertical + sharedPortLoopGap);
    case O.Left:
      return new Point(port.X - horizontal - sharedPortLoopGap, port.Y);
    case O.Right:
      return new Point(port.X + horizontal + sharedPortLoopGap, port.Y);
    default:
      return null!;
  }
}
function routeLoop(p: LoopPorts): Point[] {
  const a = bend(p.from, p.fromDirection, p.verticalOffset, p.horizontalOffset),
    b = bend(p.to, p.toDirection, p.verticalOffset, p.horizontalOffset);
  const cross = !IsVertical(p.fromDirection)
    ? new Point(a.X, b.Y)
    : new Point(b.X, a.Y);
  return [p.from, a, cross, b, p.to];
}
function computeEdgeOffset(edge: Edge): [number, number] {
  const p = edge.Points;
  let vertical: number, horizontal: number;
  if (p[0]!.X === p[1]!.X) {
    vertical = Math.abs(p[0]!.Y - p[1]!.Y);
    horizontal = Math.abs(p[p.length - 1]!.X - p[p.length - 2]!.X);
  } else {
    vertical = Math.abs(p[p.length - 1]!.Y - p[p.length - 2]!.Y);
    horizontal = Math.abs(p[0]!.X - p[1]!.X);
  }
  if (edge.Label !== null) {
    vertical += edge.Label.Height;
    horizontal += edge.Label.Width;
  }
  return [vertical, horizontal];
}
export function Route(node: Node): Edge[] {
  const available = makeLoopPorts(node),
    result: Edge[] = [];
  for (const edge of edgesInOrder(node.Edges)) {
    if (!edge.IsLoop()) continue;
    result.push(edge);
    const p = findLoopPortsForEdge(edge, available);
    edge.Points = routeLoop(p);
    if (edge.Label !== null) edge.Label.Position = Position.OutsideTopCenter;
    [p.verticalOffset, p.horizontalOffset] = computeEdgeOffset(edge);
    p.hasSource = edge.HasSourceArrow();
    p.hasTarget = edge.HasTargetArrow();
    p.source = edge.SourceArrowhead;
    p.target = edge.TargetArrowhead;
  }
  return result;
}
