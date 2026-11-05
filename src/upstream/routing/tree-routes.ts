// Translated from internal/routing/tree_routes.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { EuclideanDistance } from '../geo/math.js';
import {
  Orientation as O,
  GetOpposite,
  IsVertical,
  IsHorizontal,
} from '../geo/orientation.js';
import { TreeParentSpacing } from '../layoutgraph/geometry-policy.js';
import type { Node } from '../layoutgraph/node.js';
import type { Tree, Arrowhead } from '../layoutgraph/records.js';
import { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import type { OVGBuildGuard } from './ovg-resource.js';
export interface TreeEdgePath {
  SourcePortNode: OVGNode;
  TargetPortNode: OVGNode;
  SourceMidpoint: Point;
  TargetMidpoint: Point;
  SourceOrientationToTarget: O;
}
export function isSentinelEdgeSource(tree: Tree | null): boolean {
  return (
    tree !== null &&
    tree.SentinelEdge !== null &&
    tree.SentinelEdge.From === tree.Node
  );
}
function sentinelNode(tree: Tree): Node {
  return isSentinelEdgeSource(tree)
    ? tree.SentinelEdge!.To
    : tree.SentinelEdge!.From;
}
export function alignedPortNodeForBuild(
  tree: Tree,
  parentPort: OVGNode,
  childPort: OVGNode,
  guard: OVGBuildGuard | null,
): OVGNode {
  const parent = sentinelNode(tree),
    child = tree.Node;
  if (
    IsVertical(tree.Orientation) &&
    Math.abs(parent.Box.Center().X - child.Box.Center().X) <= 10 &&
    parentPort.X !== childPort.X &&
    child.TopLeft!.X + 5 < parentPort.X &&
    parentPort.X < child.TopLeft!.X + child.Width - 5
  ) {
    const p = new Point(parentPort.X, childPort.Y);
    return guard ? guard.newDerivedNode(p) : new OVGNode(p);
  }
  if (
    IsHorizontal(tree.Orientation) &&
    Math.abs(parent.Box.Center().Y - child.Box.Center().Y) <= 10 &&
    parentPort.Y !== childPort.Y &&
    child.TopLeft!.Y + 5 < parentPort.Y &&
    parentPort.Y < child.TopLeft!.Y + child.Height - 5
  ) {
    const p = new Point(childPort.X, parentPort.Y);
    return guard ? guard.newDerivedNode(p) : new OVGNode(p);
  }
  return childPort;
}
export function treeEdgeMidpoints(
  parent: Node,
  orientation: O,
  parentPort: Point,
  childPort: Point,
): [Point, Point] {
  const p = new Point(0, 0),
    c = new Point(0, 0);
  switch (orientation) {
    case O.Left:
      p.Y = parentPort.Y;
      c.Y = childPort.Y;
      p.X = c.X = parent.TopLeft!.X - TreeParentSpacing / 2;
      break;
    case O.Right:
      p.Y = parentPort.Y;
      c.Y = childPort.Y;
      p.X = c.X = parent.TopLeft!.X + parent.Width + TreeParentSpacing / 2;
      break;
    case O.Top:
      p.X = parentPort.X;
      c.X = childPort.X;
      p.Y = c.Y = parent.TopLeft!.Y - TreeParentSpacing / 2;
      break;
    case O.Bottom:
      p.X = parentPort.X;
      c.X = childPort.X;
      p.Y = c.Y = parent.TopLeft!.Y + parent.Height + TreeParentSpacing / 2;
      break;
  }
  return [p, c];
}
export function treeEdgePathForBuild(
  tree: Tree,
  ports: Map<Node, OVGNode[]>,
  arrowheads: Map<OVGNode, Set<Arrowhead>>,
  guard: OVGBuildGuard | null,
): TreeEdgePath {
  guard?.Step();
  const parent = sentinelNode(tree),
    child = tree.Node,
    parentIndex = parent.Shape.CenterPortIndex(tree.Orientation),
    childIndex = child.Shape.CenterPortIndex(GetOpposite(tree.Orientation));
  let parentPort = ports.get(parent)![parentIndex]!,
    childPort = ports.get(child)![childIndex]!;
  const existing = arrowheads.get(parentPort);
  if (existing?.size) {
    const arrowhead = isSentinelEdgeSource(tree)
      ? tree.SentinelEdge!.TargetArrowhead
      : tree.SentinelEdge!.SourceArrowhead;
    if (!existing.has(arrowhead)) {
      let closest: OVGNode | null = null,
        distance = Infinity;
      for (const index of parent.Shape.PortIndices(tree.Orientation)) {
        guard?.Step();
        if (index === parentIndex) continue;
        const port = ports.get(parent)![index]!,
          heads = arrowheads.get(port);
        if (!heads || heads.has(arrowhead)) {
          const d = EuclideanDistance(port.X, port.Y, childPort.X, childPort.Y);
          if (d < distance) {
            closest = port;
            distance = d;
          }
        }
      }
      if (closest) parentPort = closest;
    }
  }
  childPort = alignedPortNodeForBuild(tree, parentPort, childPort, guard);
  for (const port of ports.get(child) ?? []) {
    guard?.Step();
    if (port.Point.Equals(childPort.Point)) {
      childPort = port;
      break;
    }
  }
  const [parentMidpoint, childMidpoint] = treeEdgeMidpoints(
    parent,
    tree.Orientation,
    parentPort.Point,
    childPort.Point,
  );
  if (isSentinelEdgeSource(tree))
    return {
      SourcePortNode: childPort,
      TargetPortNode: parentPort,
      SourceMidpoint: childMidpoint,
      TargetMidpoint: parentMidpoint,
      SourceOrientationToTarget: tree.Orientation,
    };
  return {
    SourcePortNode: parentPort,
    TargetPortNode: childPort,
    SourceMidpoint: parentMidpoint,
    TargetMidpoint: childMidpoint,
    SourceOrientationToTarget: GetOpposite(tree.Orientation),
  };
}
export function addTreeNodes(
  ovg: OVG,
  g: { Nodes: Node[]; NodeToTree: Map<Node, Tree> },
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const arrows = new Map<OVGNode, Set<Arrowhead>>();
  for (const node of g.Nodes) {
    guard.Step();
    const tree = g.NodeToTree.get(node);
    if (!tree) continue;
    const path = treeEdgePathForBuild(tree, ovg.Ports, arrows, guard);
    guard.addPoint(ovg, path.SourceMidpoint);
    guard.addPoint(ovg, path.TargetMidpoint);
    if (isSentinelEdgeSource(tree)) {
      const port = guard.addNode(ovg, path.SourcePortNode);
      if (!port.isPortOf(node)) {
        const list = ovg.Ports.get(node) ?? [];
        list.push(port);
        ovg.Ports.set(node, list);
        port.addPortOwner(
          node,
          GetOpposite(path.SourceOrientationToTarget),
          false,
        );
      }
      const heads = arrows.get(path.TargetPortNode) ?? new Set();
      heads.add(tree.SentinelEdge!.TargetArrowhead);
      arrows.set(path.TargetPortNode, heads);
    } else {
      const port = guard.addNode(ovg, path.TargetPortNode);
      if (!port.isPortOf(node)) {
        const list = ovg.Ports.get(node) ?? [];
        list.push(port);
        ovg.Ports.set(node, list);
        port.addPortOwner(node, path.SourceOrientationToTarget, false);
      }
      const heads = arrows.get(path.SourcePortNode) ?? new Set();
      heads.add(tree.SentinelEdge!.SourceArrowhead);
      arrows.set(path.SourcePortNode, heads);
    }
  }
  guard.Check();
}
