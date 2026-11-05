// Translated boundary and proximity helpers from internal/routing/ovg.go and
// ovg_resource.go at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc.
import { Point } from '../geo/point.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { MinRouteNodeClearance } from '../layoutgraph/geometry-policy.js';
import { isPointNear } from '../layoutgraph/node-spatial.js';
import type { OVG } from './ovg.js';
import type { OVGBuildGuard } from './ovg-resource.js';
export function pointNearGraphNode(
  g: Graph,
  point: Point,
  guard: OVGBuildGuard,
): boolean {
  for (const node of g.Nodes) {
    guard.Step();
    if (node.IsContainer()) continue;
    if (isPointNear(node, point)) return true;
  }
  return false;
}
export class OVGPointProximityIndex {
  private byX = new Map<number, Node[]>();
  constructor(graph: Graph, xs: number[], guard: OVGBuildGuard) {
    for (const x of xs) {
      guard.Step();
      for (const node of graph.Nodes) {
        guard.Step();
        if (node.IsContainer()) continue;
        if (
          node.TopLeft!.X - MinRouteNodeClearance <= x &&
          node.TopLeft!.X + node.Width + MinRouteNodeClearance >= x
        ) {
          const list = this.byX.get(x) ?? [];
          list.push(node);
          this.byX.set(x, list);
        }
      }
    }
    guard.Check();
  }
  pointNear(x: number, y: number, guard: OVGBuildGuard): boolean {
    guard.Step();
    const point = new Point(x, y);
    for (const node of this.byX.get(x) ?? []) {
      guard.Step();
      if (isPointNear(node, point)) return true;
    }
    return false;
  }
}
export function tightBoundingBox(
  nodes: Node[],
  guard: OVGBuildGuard,
): [Point | null, Point | null] {
  if (nodes.length === 0) {
    guard.Check();
    return [new Point(-Infinity, -Infinity), new Point(Infinity, Infinity)];
  }
  if (!nodes[0]!.TopLeft) {
    guard.Check();
    return [null, null];
  }
  let minX = nodes[0]!.TopLeft!.X,
    minY = nodes[0]!.TopLeft!.Y,
    maxX = minX + nodes[0]!.Width,
    maxY = minY + nodes[0]!.Height;
  for (const node of nodes) {
    guard.Step();
    if (!node.TopLeft) return [null, null];
    minX = Math.min(minX, node.TopLeft.X);
    minY = Math.min(minY, node.TopLeft.Y);
    maxX = Math.max(maxX, node.TopLeft.X + node.Width);
    maxY = Math.max(maxY, node.TopLeft.Y + node.Height);
  }
  guard.Check();
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
export function ovgBoundingBox(ovg: OVG, guard: OVGBuildGuard): [Point, Point] {
  if (ovg.Nodes.length === 0) {
    guard.Check();
    return [new Point(-Infinity, -Infinity), new Point(Infinity, Infinity)];
  }
  let minX = ovg.Nodes[0]!.X,
    minY = ovg.Nodes[0]!.Y,
    maxX = minX,
    maxY = minY;
  for (const node of ovg.Nodes) {
    guard.Step();
    minX = Math.min(minX, node.X);
    minY = Math.min(minY, node.Y);
    maxX = Math.max(maxX, node.X);
    maxY = Math.max(maxY, node.Y);
  }
  guard.Check();
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
export function addNewBoundaryLayers(
  ovg: OVG,
  g: Graph,
  tl: Point,
  br: Point,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  for (let i = 0; i < 3; i++) {
    guard.Step();
    const length = ovg.Nodes.length;
    for (let j = 0; j < length; j++) {
      const node = ovg.Nodes[j]!;
      guard.Step();
      let point: Point | null = null;
      if (node.Y === tl.Y) point = new Point(node.X, node.Y - 20 * (i + 1));
      if (node.Y === br.Y) point = new Point(node.X, node.Y + 20 * (i + 1));
      if (node.X === tl.X) point = new Point(node.X - 20 * (i + 1), node.Y);
      if (node.X === br.X) point = new Point(node.X + 20 * (i + 1), node.Y);
      if (point && !pointNearGraphNode(g, point, guard))
        guard.addPoint(ovg, point);
    }
  }
}
export function addCornerNodes(
  ovg: OVG,
  g: Graph,
  tl: Point,
  br: Point,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  for (let i = 0; i < 3; i++) {
    guard.Step();
    const pad = 20 * (i + 1);
    for (const point of [
      new Point(tl.X - pad, tl.Y - pad),
      new Point(br.X + pad, tl.Y - pad),
      new Point(br.X + pad, br.Y + pad),
      new Point(tl.X - pad, br.Y + pad),
    ])
      if (!pointNearGraphNode(g, point, guard)) guard.addPoint(ovg, point);
  }
  guard.Check();
}
