// Translated edge-derived visibility points from internal/routing/ovg.go at
// D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Orientation as O } from '../geo/orientation.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import { fixedOverlapsForBuild } from './ovg-intersections.js';
import { OVGPortIndex, hasUnobstructedLineToPorts } from './ovg-port-index.js';
import { pointNearGraphNode, tightBoundingBox } from './ovg-boundaries.js';
import { portsByOrientation } from './ovg-ports.js';
export function perimeterPoints(
  ovg: OVG,
  node: Node,
  other: Node,
  guard: OVGBuildGuard,
): Point[] {
  const points: Point[] = [],
    top = Math.min(node.TopLeft!.Y, other.TopLeft!.Y) - 100,
    bottom =
      Math.max(node.TopLeft!.Y + node.Height, other.TopLeft!.Y + other.Height) +
      100,
    left = Math.min(node.TopLeft!.X, other.TopLeft!.X) - 100,
    right =
      Math.max(node.TopLeft!.X + node.Width, other.TopLeft!.X + other.Width) +
      100;
  for (const n of [node, other]) {
    guard.Step();
    for (const direction of [O.Top, O.Bottom, O.Left, O.Right])
      for (const port of portsByOrientation(ovg, n, direction, guard)) {
        guard.Step();
        points.push(
          direction === O.Top
            ? new Point(port.X, top)
            : direction === O.Bottom
              ? new Point(port.X, bottom)
              : direction === O.Left
                ? new Point(left, port.Y)
                : new Point(right, port.Y),
        );
      }
  }
  points.push(
    new Point(left, top),
    new Point(right, top),
    new Point(left, bottom),
    new Point(right, bottom),
  );
  guard.Check();
  return points;
}
export function halfwayPoints(
  ovg: OVG,
  node: Node,
  other: Node,
  guard: OVGBuildGuard,
): Point[] {
  const points: Point[] = [],
    orientation = nodeOrientation(node, other);
  if (orientation === O.NONE) {
    guard.Check();
    return points;
  }
  const fillTop =
      orientation === O.Bottom ||
      orientation === O.BottomLeft ||
      orientation === O.BottomRight,
    fillRight =
      orientation === O.TopLeft ||
      orientation === O.BottomLeft ||
      orientation === O.Left,
    fillBottom =
      orientation === O.Top ||
      orientation === O.TopLeft ||
      orientation === O.TopRight,
    fillLeft =
      orientation === O.TopRight ||
      orientation === O.BottomRight ||
      orientation === O.Right;
  let nt = node.TopLeft!.Copy(),
    nb = new Point(Round(nt.X + node.Width), Round(nt.Y + node.Height)),
    ot = other.TopLeft!.Copy(),
    ob = new Point(Round(ot.X + other.Width), Round(ot.Y + other.Height));
  if (node.Cluster)
    [nt, nb] = tightBoundingBox(node.Cluster.Nodes, guard) as [Point, Point];
  if (other.Cluster)
    [ot, ob] = tightBoundingBox(other.Cluster.Nodes, guard) as [Point, Point];
  let nodePorts = ovg.Ports.get(node) ?? [],
    otherPorts = ovg.Ports.get(other) ?? [];
  if (node.Sequence) {
    [nt, nb] = tightBoundingBox(node.Sequence.Nodes, guard) as [Point, Point];
    nodePorts = [...nodePorts];
    for (const n of node.Sequence.Nodes) {
      guard.Step();
      if (n !== node) nodePorts.push(...(ovg.Ports.get(n) ?? []));
    }
  }
  if (other.Sequence) {
    [ot, ob] = tightBoundingBox(other.Sequence.Nodes, guard) as [Point, Point];
    otherPorts = [...otherPorts];
    for (const n of other.Sequence.Nodes) {
      guard.Step();
      if (n !== other) otherPorts.push(...(ovg.Ports.get(n) ?? []));
    }
  }
  const add = (vertical: boolean, value: number): void => {
    for (const port of nodePorts) {
      guard.Step();
      points.push(
        vertical ? new Point(port.X, value) : new Point(value, port.Y),
      );
    }
    for (const port of otherPorts) {
      guard.Step();
      points.push(
        vertical ? new Point(port.X, value) : new Point(value, port.Y),
      );
    }
  };
  if (fillTop) add(true, (nt.Y + ob.Y) / 2);
  if (fillBottom) add(true, (ot.Y + nb.Y) / 2);
  if (fillLeft) add(false, (nt.X + ob.X) / 2);
  if (fillRight) add(false, (ot.X + nb.X) / 2);
  if (fillRight && fillBottom)
    points.push(new Point((ot.X + nb.X) / 2, (ot.Y + nb.Y) / 2));
  if (fillRight && fillTop)
    points.push(new Point((ot.X + nb.X) / 2, (nt.Y + ob.Y) / 2));
  if (fillLeft && fillTop)
    points.push(new Point((nt.X + ob.X) / 2, (nt.Y + ob.Y) / 2));
  if (fillLeft && fillBottom)
    points.push(new Point((nt.X + ob.X) / 2, (ot.Y + nb.Y) / 2));
  guard.Check();
  return points;
}
export function addEdgesNodes(ovg: OVG, g: Graph, guard: OVGBuildGuard): void {
  guard.Check();
  const fixed = fixedOverlapsForBuild(ovg, g, g.Nodes, guard),
    index = new OVGPortIndex(ovg.Ports, g, fixed, guard);
  for (const edge of g.Edges) {
    guard.Step();
    if (
      edge.IsLoop() ||
      (edge.From.Hierarchy !== null &&
        edge.To.Hierarchy !== null &&
        edge.From.Hierarchy === edge.To.Hierarchy)
    )
      continue;
    const points = [
      ...perimeterPoints(ovg, edge.From, edge.To, guard),
      ...halfwayPoints(ovg, edge.From, edge.To, guard),
    ];
    for (const point of points) {
      guard.Step();
      guard.Step();
      if (pointNearGraphNode(g, point, guard)) continue;
      const candidate = new OVGNode(point);
      if (hasUnobstructedLineToPorts(candidate, ovg, index, 1, guard))
        guard.addNode(ovg, new OVGNode(point));
    }
  }
  guard.Check();
}
