// Translated tree and loop routes from internal/routing/coordinator.go and
// loop_router.go at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc.
import { Orientation as O } from '../geo/orientation.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Tree, Arrowhead } from '../layoutgraph/records.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { New as invariant } from '../invariant/errors.js';
import { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import { Route } from './route.js';
import { treeEdgePathForBuild, type TreeEdgePath } from './tree-routes.js';
export function routeInSShape(path: TreeEdgePath): OVGNode[] {
  let current = path.SourcePortNode;
  const nodes = [current];
  const next = (orientation: O): OVGNode | null => {
    let closest: OVGNode | null = null;
    for (const edge of current.Edges) {
      const n = current.Adjacent(edge);
      switch (orientation) {
        case O.Left:
          if (
            current.Y === n.Y &&
            n.X > current.X &&
            (!closest || n.X < closest.X)
          )
            closest = n;
          break;
        case O.Right:
          if (
            current.Y === n.Y &&
            n.X < current.X &&
            (!closest || n.X > closest.X)
          )
            closest = n;
          break;
        case O.Top:
          if (
            current.X === n.X &&
            n.Y > current.Y &&
            (!closest || n.Y < closest.Y)
          )
            closest = n;
          break;
        default:
          if (
            current.X === n.X &&
            n.Y < current.Y &&
            (!closest || n.Y > closest.Y)
          )
            closest = n;
      }
    }
    return closest;
  };
  const move = (
    direction: O,
    point: { X: number; Y: number },
    reason: string,
  ): void => {
    while (current.X !== point.X || current.Y !== point.Y) {
      const n = next(direction);
      if (!n) throw invariant(`couldn't find s shaped route (${reason})`);
      current = n;
      nodes.push(current);
    }
  };
  move(
    path.SourceOrientationToTarget,
    path.SourceMidpoint,
    'source port to source midpoint',
  );
  const direction =
    path.SourceOrientationToTarget === O.Left ||
    path.SourceOrientationToTarget === O.Right
      ? path.SourcePortNode.Y < path.TargetPortNode.Y
        ? O.Top
        : O.Bottom
      : path.SourcePortNode.X < path.TargetPortNode.X
        ? O.Left
        : O.Right;
  move(direction, path.TargetMidpoint, 'source midpoint to target midpoint');
  move(
    path.SourceOrientationToTarget,
    path.TargetPortNode.Point,
    'target midpoint to target port',
  );
  return nodes;
}
export function routeSentinelEdge(
  tree: Tree,
  ports: Map<Node, OVGNode[]>,
  centers: Map<Node, OVGNode>,
  arrows: Map<OVGNode, Set<Arrowhead>>,
): Route {
  const edge = tree.SentinelEdge!,
    path = treeEdgePathForBuild(tree, ports, arrows, null),
    nodes = routeInSShape(path);
  for (const node of nodes)
    if (node.isPort()) {
      let valid = false;
      for (const owner of node.portOwners()?.keys() ?? [])
        if (
          isDescendantOf(edge.From, owner) ||
          isDescendantOf(edge.To, owner)
        ) {
          valid = true;
          break;
        }
      if (!valid) throw new Error("routing through other node's port");
    }
  const route = new Route(edge, [
    centers.get(edge.From)!,
    ...nodes,
    centers.get(edge.To)!,
  ]);
  route.FromPort = path.SourcePortNode.Point.Copy();
  route.ToPort = path.TargetPortNode.Point.Copy();
  return route;
}
export function makeLoopRoute(edge: Edge, ovg: OVG): Route {
  const route = new Route(edge, [
    ovg.Centers.get(edge.From)!,
    ...edge.Points.map((p) => new OVGNode(p)),
    ovg.Centers.get(edge.To)!,
  ]);
  route.FromPort = edge.Points[0]!.Copy();
  route.ToPort = edge.Points.at(-1)!.Copy();
  return route;
}
