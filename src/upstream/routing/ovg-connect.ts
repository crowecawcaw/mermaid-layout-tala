// Translated visibility sweep connections from internal/routing/ovg.go and
// ovg_resource.go at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc.
import { Orientation as O } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { isPointOnNode } from '../layoutgraph/node-spatial.js';
import { Slice } from '../gosort/slice.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import { portDirectionsAny, portDirectionsHas } from './ovg-node.js';
import { checkedOVGEdgeCapacity, type OVGBuildGuard } from './ovg-resource.js';
import { fixedOverlapsForBuild } from './ovg-intersections.js';
import { routeSearchIsDescendantOf } from './search-guard.js';
import { passesThroughAllowingPorts } from './ovg-port-boundaries.js';
export function isRestrictedSequencePort(
  node: OVGNode,
  guard: OVGBuildGuard,
): boolean {
  const owners = node.portOwners();
  if (!owners?.size) {
    guard.Check();
    return false;
  }
  for (const [owner, metadata] of owners) {
    guard.Step();
    if (!owner.Sequence) return false;
    if (
      portDirectionsAny(metadata.directions, (direction) =>
        direction === O.Left
          ? owner.Sequence!.Nodes[0] === owner
          : direction === O.Right
            ? owner.Sequence!.Nodes.at(-1) === owner
            : true,
      )
    )
      return false;
  }
  guard.Check();
  return true;
}
export function isMisdirectedPortPair(
  first: OVGNode,
  second: OVGNode,
  horizontal: boolean,
  guard: OVGBuildGuard,
): boolean {
  guard.Check();
  const one = first.portOwners(),
    two = second.portOwners();
  if (!one?.size || !two?.size) {
    guard.Check();
    return false;
  }
  for (const [a, am] of one) {
    guard.Step();
    for (const [b, bm] of two) {
      guard.Step();
      if (a === b) return false;
      const correct = horizontal
        ? portDirectionsHas(am.directions, O.Right) &&
          portDirectionsHas(bm.directions, O.Left)
        : portDirectionsHas(am.directions, O.Bottom) &&
          portDirectionsHas(bm.directions, O.Top);
      const ab = routeSearchIsDescendantOf(guard, a, b),
        ba = routeSearchIsDescendantOf(guard, b, a);
      if (correct || ab || ba) return false;
    }
  }
  guard.Check();
  return true;
}
export function connectNodesOnSameLine(
  ovg: OVG,
  nodes: OVGNode[],
  position: number,
  horizontal: boolean,
  fixed: Set<Node>,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const candidates: Node[] = [];
  for (const n of ovg.NodesInsideBoundingBox ?? []) {
    guard.Step();
    if (fixed.has(n)) continue;
    if (
      (horizontal &&
        n.TopLeft!.Y <= position &&
        n.TopLeft!.Y + n.Height >= position) ||
      (!horizontal &&
        n.TopLeft!.X <= position &&
        n.TopLeft!.X + n.Width >= position)
    )
      candidates.push(n);
  }
  guard.reserveSortWork(candidates.length);
  Slice(candidates, (a, b) =>
    horizontal ? a.TopLeft!.X < b.TopLeft!.X : a.TopLeft!.Y < b.TopLeft!.Y,
  );
  guard.reserveSortWork(nodes.length);
  Slice(nodes, (a, b) => (horizontal ? a.X < b.X : a.Y < b.Y));
  let start = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    guard.Step();
    const node = nodes[i]!,
      closest = nodes[i + 1]!;
    if (isMisdirectedPortPair(node, closest, horizontal, guard)) continue;
    let connect = true;
    for (let j = start; j < candidates.length; j++) {
      guard.Step();
      const rectangle = candidates[j]!;
      if (
        (horizontal && rectangle.TopLeft!.X > closest.X) ||
        (!horizontal && rectangle.TopLeft!.Y > closest.Y)
      )
        break;
      const passes = (from: OVGNode, to: OVGNode): boolean => {
        let through = true;
        portDirectionsAny(
          from.portDirectionsForObstacle(rectangle),
          (direction) => {
            if (
              !passesThroughAllowingPorts(
                rectangle,
                from.Point,
                to.Point,
                direction,
                ovg.Ports.get(rectangle) ?? [],
                guard,
              )
            ) {
              through = false;
              return true;
            }
            return false;
          },
        );
        return through;
      };
      const c1 = passes(node, closest),
        c2 = passes(closest, node);
      if (c1 && c2) {
        if (
          rectangle.Sequence &&
          !horizontal &&
          (rectangle.TopLeft!.Y === closest.Y ||
            rectangle.TopLeft!.Y + rectangle.Height === node.Y)
        )
          continue;
        const exception =
          rectangle.IsContainer() &&
          (isPointOnNode(rectangle, node.Point) ||
            isPointOnNode(rectangle, closest.Point));
        if (!exception) {
          connect = false;
          break;
        }
      } else start = j;
    }
    if (connect) guard.connect(ovg, node, closest);
  }
}
export function connectNodes(ovg: OVG, g: Graph, guard: OVGBuildGuard): void {
  guard.Check();
  if (BigInt(ovg.Edges.length) > guard.edges)
    guard.reserveEdges(BigInt(ovg.Edges.length) - guard.edges);
  const horizontal = new Map<number, OVGNode[]>(),
    vertical = new Map<number, OVGNode[]>();
  let eligible = 0n;
  const append = (
    map: Map<number, OVGNode[]>,
    key: number,
    node: OVGNode,
  ): void => {
    const values = map.get(key) ?? [];
    values.push(node);
    map.set(key, values);
  };
  for (const node of ovg.Nodes) {
    guard.Step();
    if (node.IsTunnel || isRestrictedSequencePort(node, guard)) continue;
    eligible++;
    append(horizontal, node.Y, node);
    append(vertical, node.X, node);
  }
  checkedOVGEdgeCapacity(
    BigInt(ovg.Edges.length),
    eligible,
    BigInt(horizontal.size),
    BigInt(vertical.size),
    guard.limits.edges,
    (1n << 63n) - 1n,
  );
  ovg.Edges = [...ovg.Edges];
  const fixed = fixedOverlapsForBuild(
    ovg,
    g,
    ovg.NodesInsideBoundingBox ?? [],
    guard,
  );
  const lines = (map: Map<number, OVGNode[]>): number[] => {
    const coords: number[] = [];
    for (const key of map.keys()) {
      guard.Step();
      coords.push(key);
    }
    guard.reserveSortWork(coords.length);
    coords.sort((a, b) => a - b);
    return coords;
  };
  for (const y of lines(horizontal)) {
    guard.Step();
    connectNodesOnSameLine(ovg, horizontal.get(y)!, y, true, fixed, guard);
  }
  for (const x of lines(vertical)) {
    guard.Step();
    connectNodesOnSameLine(ovg, vertical.get(x)!, x, false, fixed, guard);
  }
}
