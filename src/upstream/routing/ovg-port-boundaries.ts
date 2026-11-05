// Translated visibility port boundary operations from internal/routing/ovg.go
// and ovg_resource.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Orientation as O } from '../geo/orientation.js';
import { MinPortClearance } from '../layoutgraph/geometry-policy.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import { portDirectionsAny } from './ovg-node.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import { pointNearGraphNode } from './ovg-boundaries.js';
import { routeSearchIsDescendantOf } from './search-guard.js';
export function passesThroughAllowingPorts(
  node: Node,
  p1: Point,
  p2: Point,
  direction: O,
  ports: OVGNode[],
  guard: OVGBuildGuard,
): boolean {
  if (ports.length === 0) {
    const result = passesThrough(node, p1, p2);
    guard.Check();
    return result;
  }
  const allows =
    direction === O.Top
      ? p1.X === p2.X && p1.Y > p2.Y
      : direction === O.Bottom
        ? p1.X === p2.X && p1.Y < p2.Y
        : direction === O.Left
          ? p1.Y === p2.Y && p1.X > p2.X
          : direction === O.Right
            ? p1.Y === p2.Y && p1.X < p2.X
            : false;
  if (allows)
    for (const port of ports) {
      guard.Step();
      if (port.Point.Equals(p1) || port.Point.Equals(p2)) return false;
    }
  const result = passesThrough(node, p1, p2);
  guard.Check();
  return result;
}
export function createPortsConnectionsToBoundaries(
  ovg: OVG,
  owner: Node,
  ports: OVGNode[],
  tl: Point,
  br: Point,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const seen = new Set<OVGNode>();
  for (const port of ports) {
    guard.Step();
    if (seen.has(port)) continue;
    seen.add(port);
    portDirectionsAny(port.portDirectionsFor(owner)[0], (direction) => {
      guard.Step();
      let p: Point;
      switch (direction) {
        case O.Top:
          p = new Point(port.X, port.Y - MinPortClearance);
          break;
        case O.Bottom:
          p = new Point(port.X, port.Y + MinPortClearance);
          break;
        case O.Left:
          p = new Point(port.X - MinPortClearance, port.Y);
          break;
        case O.Right:
          p = new Point(port.X + MinPortClearance, port.Y);
          break;
        default:
          return false;
      }
      const n = guard.addPoint(ovg, p);
      for (let i = 1; i < 4; i++) {
        guard.Step();
        if (direction === O.Top || direction === O.Bottom) {
          guard.addPoint(ovg, new Point(tl.X - 20 * i, n.Y));
          guard.addPoint(ovg, new Point(br.X + 20 * i, n.Y));
        } else {
          guard.addPoint(ovg, new Point(n.X, tl.Y - 20 * i));
          guard.addPoint(ovg, new Point(n.X, br.Y + 20 * i));
        }
      }
      return false;
    });
  }
  guard.Check();
}
export function addPortConnectionNodesAtBoundaries(
  ovg: OVG,
  g: Graph,
  tl: Point,
  br: Point,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  for (let i = 0; i < 3; i++) {
    guard.Step();
    for (const [node, ports] of ovg.Ports) {
      guard.Step();
      let added = false;
      const seen = new Set<OVGNode>();
      for (const port of ports) {
        guard.Step();
        if (seen.has(port)) continue;
        seen.add(port);
        portDirectionsAny(port.portDirectionsFor(node)[0], (direction) => {
          guard.Step();
          const boundary = [
            new Point(port.X, tl.Y - 20 * (i + 1)),
            new Point(port.X, br.Y + 20 * (i + 1)),
            new Point(tl.X - 20 * (i + 1), port.Y),
            new Point(br.X + 20 * (i + 1), port.Y),
          ];
          for (const point of boundary) {
            guard.Step();
            let blocked = false;
            for (const rectangle of ovg.NodesInsideBoundingBox ?? []) {
              guard.Step();
              if (
                passesThroughAllowingPorts(
                  rectangle,
                  port.Point,
                  point,
                  direction,
                  ovg.Ports.get(rectangle) ?? [],
                  guard,
                )
              ) {
                let allowed = false;
                if (
                  rectangle.IsContainer() &&
                  routeSearchIsDescendantOf(guard, node, rectangle)
                )
                  allowed = true;
                if (!allowed) {
                  blocked = true;
                  break;
                }
              }
            }
            if (blocked) continue;
            if (!pointNearGraphNode(g, point, guard)) {
              guard.addPoint(ovg, point);
              added = true;
            }
          }
          return false;
        });
      }
      if (!added)
        createPortsConnectionsToBoundaries(ovg, node, ports, tl, br, guard);
    }
  }
}
