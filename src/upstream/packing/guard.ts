// Translated from internal/packing/guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxEngineNodes,
} from '../limits/work.js';
import { New as invariant } from '../invariant/errors.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { FixedBoundingBox, BoundingBox } from '../graphbounds/bounds.js';
import {
  containerPadding,
  InsidePlacement,
  fitToBoundingBox,
} from '../layoutgraph/node-geometry.js';
import { allDescendantNodesGuarded } from '../layoutgraph/containment.js';
import {
  clusterSyncGeometryWithWork,
  sequenceSyncGeometryWithWork,
} from '../layoutgraph/group-geometry.js';
export function newWorkGuard(ctx: Context, limit: bigint): WorkGuard {
  const guard = new WorkGuard(ctx, 'BinPack', MaxEngineWorkUnits);
  guard.SetLimit(limit);
  return guard;
}
export function binPackScoreGuarded(
  nodes: Node[],
  root: Node | null,
  guard: WorkGuard,
): number {
  const [tl, br] = FixedBoundingBox(nodes, guard),
    width = br.X - tl.X,
    height = br.Y - tl.Y;
  let penalty = 0;
  if (root) {
    if (
      root.DesiredWidth !== null &&
      root.DesiredHeight === null &&
      width < root.DesiredWidth
    )
      penalty = root.DesiredWidth - width;
    else if (
      root.DesiredWidth === null &&
      root.DesiredHeight !== null &&
      height < root.DesiredHeight
    )
      penalty = root.DesiredHeight - height;
  }
  const score =
    width * height + (width - height) ** 2 * 0.5 + penalty ** 2 * 0.5;
  guard.Finish();
  return score;
}
export function binPackContainerTopLeft(
  g: Graph,
  container: Node | null,
  children: Node[],
  guard: WorkGuard,
): Point {
  const [tl, br] = FixedBoundingBox(children, guard);
  if (!container) {
    guard.Finish();
    return tl;
  }
  const inside = InsidePlacement(
    container,
    br.X - tl.X,
    br.Y - tl.Y,
    containerPadding(g, container, false),
  );
  guard.Finish();
  return inside;
}
export function binPackIsDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: WorkGuard,
): boolean {
  const seen = new Set<Node>();
  for (;;) {
    guard.Step();
    if (descendant === ancestor) return true;
    if (!descendant) return false;
    if (seen.has(descendant))
      throw invariant('BinPack found a cycle in node ancestry');
    seen.add(descendant);
    if (descendant.Container) descendant = descendant.Container;
    else if (descendant.Cluster?.Vessel) descendant = descendant.Cluster.Vessel;
    else if (descendant.Sequence?.Vessel)
      descendant = descendant.Sequence.Vessel;
    else return ancestor === null;
  }
}
export function binPackOrderedNears(node: Node, guard: WorkGuard): Node[] {
  if (!node) throw invariant('BinPack cannot order nears for a nil node');
  if (node.Nears.size > MaxEngineNodes)
    throw invariant('BinPack node near count exceeds node limit');
  const nears: Node[] = [];
  for (const near of node.Nears) {
    guard.Step();
    if (!near) throw invariant('BinPack found a nil near');
    nears.push(near);
  }
  for (let width = nears.length; width > 1; width = Math.floor((width + 1) / 2))
    for (const _ of nears) guard.Step();
  nears.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
  guard.Finish();
  return nears;
}
export function binPackHasExternalConnection(
  g: Graph,
  node: Node,
  container: Node | null,
  near: boolean,
  containerIsExternal: boolean,
  guard: WorkGuard,
): boolean {
  if (!container) return false;
  const descendants = allDescendantNodesGuarded(g, node, true, guard),
    visit = [node];
  for (const n of descendants) {
    guard.Step();
    visit.push(n);
  }
  for (const current of visit) {
    guard.Step();
    if (near) {
      for (const adjacent of binPackOrderedNears(current, guard))
        if (!binPackIsDescendantOf(adjacent, container, guard)) return true;
      continue;
    }
    for (const edge of current.Edges) {
      guard.Step();
      const adjacent = current.Adjacent(edge);
      if (containerIsExternal && adjacent === container) return true;
      if (!binPackIsDescendantOf(adjacent, container, guard)) return true;
    }
  }
  guard.Finish();
  return false;
}
export interface BinPackHierarchyBox {
  topLeft: Point;
  bottomRight: Point;
}
export function binPackHierarchyBoxes(
  packed: Node[][],
  guard: WorkGuard,
): BinPackHierarchyBox[] {
  const boxes: BinPackHierarchyBox[] = [];
  for (const nodes of packed) {
    guard.Step();
    if (!nodes.length)
      throw invariant('BinPack contains an empty packed subgraph');
    if (!nodes[0]!.Hierarchy) continue;
    const [topLeft, bottomRight] = BoundingBox(nodes, guard);
    boxes.push({ topLeft, bottomRight });
  }
  guard.Finish();
  return boxes;
}
export function binPackPointInHierarchy(
  boxes: BinPackHierarchyBox[],
  point: Point,
  guard: WorkGuard,
): boolean {
  if (!point) throw invariant('BinPack hierarchy check received a nil point');
  for (const box of boxes) {
    guard.Step();
    if (
      box.topLeft.X <= point.X &&
      point.X <= box.bottomRight.X &&
      box.topLeft.Y <= point.Y &&
      point.Y <= box.bottomRight.Y
    )
      return true;
  }
  guard.Finish();
  return false;
}
export function binPackSmallestDeltas(
  subgraphs: Node[][],
  guard: WorkGuard,
): [number, number] {
  let x = Infinity,
    y = Infinity;
  for (const subgraph of subgraphs) {
    guard.Step();
    const [tl, br] = BoundingBox(subgraph, guard);
    x = Math.min(x, br.X - tl.X);
    y = Math.min(y, br.Y - tl.Y);
  }
  guard.Finish();
  return [x, y];
}
function expandForLabels(
  children: Node[],
  tl: Point,
  br: Point,
  guard: WorkGuard,
): void {
  for (const child of children) {
    guard.Step();
    if (!child || !child.TopLeft)
      throw invariant('BinPack container contains an unplaced child');
    if (
      child.Label &&
      (child.TopLeft.X === tl.X || child.TopLeft.X + child.Width === br.X) &&
      child.Label.Width > child.Width
    ) {
      tl.X = Math.min(
        tl.X,
        Math.floor(child.TopLeft.X + (child.Width / 2 - child.Label.Width / 2)),
      );
      br.X = Math.max(
        br.X,
        Math.ceil(
          child.TopLeft.X +
            child.Width -
            (child.Width / 2 - child.Label.Width / 2),
        ),
      );
    }
  }
}
export function binPackWrapChildren(root: Node, guard: WorkGuard): void {
  if (!root.isContainer) return;
  const graph = root.Graph!,
    children = graph.Containers.get(root) ?? [],
    padding = containerPadding(graph, root, false),
    [tl, br] = FixedBoundingBox(children, guard);
  expandForLabels(children, tl, br, guard);
  fitToBoundingBox(root, tl, br, padding);
  const inside = InsidePlacement(root, br.X - tl.X, br.Y - tl.Y, padding);
  root.Translate(tl.X - inside.X, tl.Y - inside.Y);
  guard.Finish();
}
export function binPackMoveNodeWithChildren(
  node: Node,
  dx: number,
  dy: number,
  guard: WorkGuard,
): void {
  guard.Step();
  if (dx === 0 && dy === 0) return;
  if (!node || !node.TopLeft || !node.Graph)
    throw invariant(
      'BinPack cannot move an unplaced node or a node without a graph',
    );
  node.Translate(dx, dy);
  for (const child of allDescendantNodesGuarded(
    node.Graph,
    node,
    true,
    guard,
  )) {
    guard.Step();
    if (!child || !child.TopLeft)
      throw invariant('BinPack cannot move an unplaced descendant');
    child.Translate(dx, dy);
  }
  guard.Finish();
}
export function binPackPositionContainerChildren(
  node: Node,
  guard: WorkGuard,
): void {
  guard.Step();
  if (!node || !node.isContainer) return;
  if (!node.Graph) throw invariant('BinPack container has no graph');
  const children = node.Graph.Containers.get(node) ?? [],
    [tl, br] = FixedBoundingBox(children, guard);
  expandForLabels(children, tl, br, guard);
  const inside = InsidePlacement(node, br.X - tl.X, br.Y - tl.Y, {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  for (const child of children)
    binPackMoveNodeWithChildren(child, inside.X - tl.X, inside.Y - tl.Y, guard);
  guard.Finish();
}
export function binPackReverseDFSWalk(
  root: Node,
  apply: (node: Node) => void,
  guard: WorkGuard,
): void {
  if (!root) throw invariant('BinPack reverse traversal contains a nil node');
  const stack = [{ node: root, phase: 0, index: 0 }],
    active = new Set<Node>([root]);
  while (stack.length) {
    guard.Step();
    const frame = stack[stack.length - 1]!,
      graph = frame.node.Graph;
    if (!graph)
      throw invariant('BinPack reverse traversal found a node without a graph');
    let children: Node[] = [];
    if (frame.phase === 0) {
      if (frame.node.isContainer)
        children = graph.Containers.get(frame.node) ?? [];
    } else if (frame.phase === 1) {
      if (frame.node.isClusterVessel) {
        const cluster = graph.Clusters.get(frame.node);
        if (!cluster)
          throw invariant(
            'BinPack reverse traversal found a cluster vessel without a cluster',
          );
        children = cluster.Nodes;
      } else children = graph.Sequences.get(frame.node)?.Nodes ?? [];
    } else {
      apply(frame.node);
      active.delete(frame.node);
      stack.pop();
      continue;
    }
    if (frame.index >= children.length) {
      frame.phase++;
      frame.index = 0;
      continue;
    }
    const child = children[frame.index++]!;
    if (!child)
      throw invariant('BinPack reverse traversal contains a nil child');
    if (active.has(child))
      throw invariant('BinPack reverse traversal found a topology cycle');
    active.add(child);
    stack.push({ node: child, phase: 0, index: 0 });
  }
  guard.Finish();
}
export function binPackSyncClusters(graph: Graph, guard: WorkGuard): void {
  if (!graph) throw invariant('BinPack cannot synchronize a nil graph');
  if (!graph.Clusters.size) {
    guard.Finish();
    return;
  }
  const work = {
    Step: () => guard.Step(),
    Finish: () => guard.Finish(),
    MoveNodeWithChildren: (n: Node, x: number, y: number) =>
      binPackMoveNodeWithChildren(n, x, y, guard),
    PositionContainerChildren: (n: Node) =>
      binPackPositionContainerChildren(n, guard),
  };
  for (const root of graph.Nodes) {
    guard.Step();
    binPackReverseDFSWalk(
      root,
      (node) => {
        if (node.isClusterVessel)
          clusterSyncGeometryWithWork(graph.Clusters.get(node)!, work);
      },
      guard,
    );
  }
  guard.Finish();
}
export function binPackSyncSequences(graph: Graph, guard: WorkGuard): void {
  if (!graph) throw invariant('BinPack cannot synchronize a nil graph');
  if (!graph.Sequences.size) {
    guard.Finish();
    return;
  }
  for (const root of graph.Nodes) {
    guard.Step();
    binPackReverseDFSWalk(
      root,
      (node) => {
        const sequence = graph.Sequences.get(node);
        if (sequence) sequenceSyncGeometryWithWork(sequence, guard);
      },
      guard,
    );
  }
  guard.Finish();
}
export function allEdgesHaveCompleteRoutesGuarded(
  graph: Graph,
  root: Node | null,
  guard: WorkGuard,
): [boolean, import('../layoutgraph/edge.js').Edge[] | null] {
  if (!graph) throw invariant('BinPack received a nil graph');
  const descendants = root
      ? allDescendantNodesGuarded(graph, root, true, guard)
      : graph.Nodes,
    affected = root ? [root, ...descendants] : [...descendants],
    nodeSet = new Set<Node>();
  for (const node of affected) {
    guard.Step();
    if (!node || node.Graph !== graph)
      throw invariant('BinPack affected-node inventory is malformed');
    if (nodeSet.has(node))
      throw invariant(
        `BinPack affected-node inventory repeats node ${node.ID}`,
      );
    nodeSet.add(node);
  }
  type Edge = import('../layoutgraph/edge.js').Edge;
  const expected = new Map<Node, Map<Edge, number>>(),
    totals = new Map<Node, number>();
  for (const node of affected) expected.set(node, new Map());
  const graphEdges = new Set<Edge>(),
    incident: Edge[] = [];
  let routed = 0;
  for (let i = 0; i < graph.Edges.length; i++) {
    guard.Step();
    const edge = graph.Edges[i];
    if (!edge) throw invariant(`BinPack found a nil edge at index ${i}`);
    if (!edge.From || !edge.To)
      throw invariant(`BinPack edge ${edge.ID} has a nil endpoint`);
    if (edge.From.Graph !== graph || edge.To.Graph !== graph)
      throw invariant(
        `BinPack edge ${edge.ID} has an endpoint owned by another graph`,
      );
    let affects = false;
    const record = (node: Node): void => {
      affects = true;
      const entries = expected.get(node)!;
      entries.set(edge, (entries.get(edge) ?? 0) + 1);
      totals.set(node, (totals.get(node) ?? 0) + 1);
    };
    if (nodeSet.has(edge.From)) record(edge.From);
    if (edge.To !== edge.From && nodeSet.has(edge.To)) record(edge.To);
    if (affects) {
      if (graphEdges.has(edge))
        throw invariant(
          `BinPack graph edge inventory repeats affected edge ${edge.ID}`,
        );
      graphEdges.add(edge);
    }
    if (edge.Points.length === 0) continue;
    if (edge.Points.length < 2)
      throw invariant(
        `BinPack edge ${edge.ID} has an incomplete route with ${edge.Points.length} point(s)`,
      );
    for (let j = 0; j < edge.Points.length; j++) {
      guard.Step();
      if (!edge.Points[j])
        throw invariant(
          `BinPack edge ${edge.ID} has a nil route point at index ${j}`,
        );
    }
    routed++;
    if (root && (edge.From === root || edge.To === root)) incident.push(edge);
  }
  if (routed !== 0 && routed !== graph.Edges.length)
    throw invariant(
      `BinPack graph is partially routed: ${routed} of ${graph.Edges.length} edges have routes`,
    );
  for (const node of affected) {
    const actual = new Map<Edge, number>();
    for (let i = 0; i < node.Edges.length; i++) {
      guard.Step();
      const edge = node.Edges[i];
      if (!edge)
        throw invariant(
          `BinPack node ${node.ID} edge inventory contains a nil edge at index ${i}`,
        );
      if (edge.From !== node && edge.To !== node)
        throw invariant(
          `BinPack node ${node.ID} edge inventory contains non-incident edge ${edge.ID}`,
        );
      const count = (actual.get(edge) ?? 0) + 1;
      actual.set(edge, count);
      const needed = expected.get(node)!.get(edge) ?? 0;
      if (count > needed)
        throw invariant(
          `BinPack node ${node.ID} edge inventory has ${count} occurrence(s) of edge ${edge.ID}; graph requires ${needed}`,
        );
    }
    if (node.Edges.length !== (totals.get(node) ?? 0))
      throw invariant(
        `BinPack node ${node.ID} edge inventory has ${node.Edges.length} occurrence(s); graph requires ${totals.get(node) ?? 0}`,
      );
  }
  guard.Finish();
  return routed === 0
    ? [false, null]
    : [true, incident.length ? incident : null];
}
