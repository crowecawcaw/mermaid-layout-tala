// Translated hierarchy visibility operations from internal/routing/
// ovg_hierarchy.go at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc.
import { Point } from '../geo/point.js';
import { Orientation as O, IsHorizontal } from '../geo/orientation.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Hierarchy } from '../layoutgraph/records.js';
import { Slice } from '../gosort/slice.js';
import { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import { portDirectionsTransformed } from './ovg-node.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import { portsByOrientation, addPorts } from './ovg-ports.js';
import {
  addIntersections,
  addNodesIntersections,
} from './ovg-intersections.js';
import {
  ovgBoundingBox,
  addNewBoundaryLayers,
  addCornerNodes,
} from './ovg-boundaries.js';
export function transposePortDirection(d: O): O {
  switch (d) {
    case O.Top:
      return O.Left;
    case O.Bottom:
      return O.Right;
    case O.Left:
      return O.Top;
    case O.Right:
      return O.Bottom;
    case O.TopRight:
      return O.BottomLeft;
    case O.BottomLeft:
      return O.TopRight;
    default:
      return d;
  }
}
export function mirrorPortDirection(d: O, x: boolean, y: boolean): O {
  if (x) {
    switch (d) {
      case O.Left:
        d = O.Right;
        break;
      case O.Right:
        d = O.Left;
        break;
      case O.TopLeft:
        d = O.TopRight;
        break;
      case O.TopRight:
        d = O.TopLeft;
        break;
      case O.BottomLeft:
        d = O.BottomRight;
        break;
      case O.BottomRight:
        d = O.BottomLeft;
        break;
    }
  }
  if (y) {
    switch (d) {
      case O.Top:
        d = O.Bottom;
        break;
      case O.Bottom:
        d = O.Top;
        break;
      case O.TopLeft:
        d = O.BottomLeft;
        break;
      case O.TopRight:
        d = O.BottomRight;
        break;
      case O.BottomLeft:
        d = O.TopLeft;
        break;
      case O.BottomRight:
        d = O.TopRight;
        break;
    }
  }
  return d;
}
export function transformHierarchyOVGNodes(
  ovg: OVG,
  point: (node: OVGNode) => void,
  direction: (value: O) => O,
): void {
  for (const node of ovg.Nodes) {
    point(node);
    for (const [owner, metadata] of node.portOwners() ?? [])
      node.setPortDirections(
        owner,
        portDirectionsTransformed(metadata.directions, direction),
      );
  }
  ovg.reindexOccupiedPoints();
}
export function transposeOVG(ovg: OVG): void {
  transformHierarchyOVGNodes(
    ovg,
    (node) => {
      [node.X, node.Y] = [node.Y, node.X];
    },
    transposePortDirection,
  );
  for (const node of ovg.NodesInsideBoundingBox ?? []) {
    [node.Width, node.Height] = [node.Height, node.Width];
    node.TopLeft!.Transpose();
    [node.padding.left, node.padding.top] = [
      node.padding.top,
      node.padding.left,
    ];
    [node.padding.right, node.padding.bottom] = [
      node.padding.bottom,
      node.padding.right,
    ];
    [node.margin.left, node.margin.top] = [node.margin.top, node.margin.left];
    [node.margin.right, node.margin.bottom] = [
      node.margin.bottom,
      node.margin.right,
    ];
  }
}
export function reserveHierarchyTransform(
  ovg: OVG,
  count: number,
  guard: OVGBuildGuard,
): void {
  guard.Add(BigInt(count));
  for (const node of ovg.Nodes) {
    guard.Step();
    guard.Add(2n);
    for (const _ of node.portOwners() ?? []) {
      guard.Step();
      guard.Add(1n);
    }
  }
  guard.Check();
}
export function addBoundaryNodesAboveLevelNodes(
  ovg: OVG,
  above: Node[],
  below: Node[],
  left: number,
  right: number,
  guard: OVGBuildGuard,
): number[] {
  guard.Check();
  let minY = Infinity,
    edgesAbove = 1;
  for (const node of below) {
    guard.Step();
    minY = Math.min(minY, node.TopLeft!.Y);
    for (const edge of node.Edges) {
      guard.Step();
      const adj = node.Adjacent(edge);
      if (edge.IsLoop() || !adj.Hierarchy) continue;
      if (
        (adj.Hierarchy.Levels().get(adj) ?? 0) <
        (node.Hierarchy!.Levels().get(node) ?? 0)
      )
        edgesAbove++;
    }
  }
  let maxY = -Infinity;
  for (const node of above) {
    guard.Step();
    maxY = Math.max(maxY, node.TopLeft!.Y + node.Height);
  }
  const distance = minY - maxY,
    lines = Math.min(edgesAbove, distance / 20),
    pad = Math.max(Math.ceil(distance / lines), 20),
    ys: number[] = [];
  let y = minY;
  for (let i = 0; i < Math.trunc(lines) - 1; i++) {
    guard.Step();
    y -= pad;
    ys.push(y);
    guard.addPoint(ovg, new Point(left, y));
    guard.addPoint(ovg, new Point(right, y));
  }
  guard.Check();
  return ys;
}
export function addPortAlignedNodes(
  ovg: OVG,
  above: Node[],
  below: Node[],
  ys: number[],
  guard: OVGBuildGuard,
): void {
  guard.Check();
  for (const y of ys) {
    guard.Step();
    for (const [nodes, direction] of [
      [above, O.Bottom],
      [below, O.Top],
    ] as [Node[], O][])
      for (const node of nodes) {
        guard.Step();
        for (const port of portsByOrientation(ovg, node, direction, guard))
          guard.addPoint(ovg, new Point(port.X, y));
      }
  }
  guard.Check();
}
export function addLevelNodes(
  ovg: OVG,
  levels: Map<number, Node[]>,
  minX: number,
  maxX: number,
  guard: OVGBuildGuard,
): Set<number> {
  guard.Check();
  const xs = new Set<number>();
  for (let l = 0; l < levels.size; l++) {
    guard.Step();
    const nodes = levels.get(l)!;
    let last = false,
      index = 0,
      node = nodes[index]!,
      ports = portsByOrientation(ovg, node, O.Left, guard);
    for (let x = minX; x <= maxX; x += 20) {
      guard.Step();
      xs.add(x);
      for (const port of ports) guard.addPoint(ovg, new Point(x, port.Y));
      if (!last && x >= node.TopLeft!.X - 20) {
        x = Math.ceil((node.TopLeft!.X + node.Width) / 20) * 20;
        ports = portsByOrientation(ovg, node, O.Right, guard);
        last = index === nodes.length - 1;
        if (!last) {
          node = nodes[++index]!;
          ports = [...ports, ...portsByOrientation(ovg, node, O.Left, guard)];
        }
      }
    }
  }
  guard.Check();
  return xs;
}
export function addHierarchyLevelNodes(
  ovg: OVG,
  g: Graph,
  hierarchy: Hierarchy,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const levels = new Map<number, Node[]>();
  for (const [node, level] of hierarchy.Levels()) {
    guard.Step();
    const values = levels.get(level) ?? [];
    values.push(node);
    levels.set(level, values);
  }
  for (let level = 0; level < levels.size; level++) {
    guard.Step();
    const nodes = levels.get(level)!;
    guard.reserveSortWork(nodes.length);
    Slice(nodes, (a, b) => a.TopLeft!.X < b.TopLeft!.X);
  }
  const [tl, br] = ovgBoundingBox(ovg, guard);
  tl.X = Math.floor((tl.X - 20) / 20) * 20;
  const width = Math.ceil((br.X - tl.X) / 20) * 20;
  br.X = tl.X + width + 20;
  const ys = new Set<number>();
  for (let level = 1; level < levels.size; level++) {
    guard.Step();
    const levelYs = addBoundaryNodesAboveLevelNodes(
      ovg,
      levels.get(level - 1)!,
      levels.get(level)!,
      tl.X,
      br.X,
      guard,
    );
    addPortAlignedNodes(
      ovg,
      levels.get(level - 1)!,
      levels.get(level)!,
      levelYs,
      guard,
    );
    for (const y of levelYs) ys.add(y);
  }
  const xs = addLevelNodes(ovg, levels, tl.X, br.X, guard);
  addIntersections(ovg, g, xs, ys, guard);
}
function mirrorNode(node: Node, x: boolean, y: boolean): void {
  if (x)
    node.TopLeft!.X =
      -node.TopLeft!.X -
      node.Width +
      (node.LoopOffsets.get(O.Left) ?? 0) -
      (node.LoopOffsets.get(O.Right) ?? 0);
  if (y)
    node.TopLeft!.Y =
      -node.TopLeft!.Y -
      node.Height +
      (node.LoopOffsets.get(O.Top) ?? 0) -
      (node.LoopOffsets.get(O.Bottom) ?? 0);
}
export function newOVGForHierarchy(
  g: Graph,
  h: Hierarchy,
  guard: OVGBuildGuard,
): OVG {
  guard.Check();
  const nodes: Node[] = [];
  for (const node of h.Levels().keys()) {
    guard.Step();
    nodes.push(node);
  }
  guard.reserveSortWork(nodes.length);
  nodes.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
  guard.Check();
  const ovg = new OVG(nodes);
  addPorts(ovg, g, guard);
  const direction = nodes[0]!.Graph!.Direction(nodes[0]!.container());
  let mirrored = false,
    transposed = false;
  try {
    if (direction === O.Left || direction === O.Top) {
      reserveHierarchyTransform(ovg, nodes.length, guard);
      const x = direction === O.Left,
        y = direction === O.Top;
      for (const node of nodes) mirrorNode(node, x, y);
      transformHierarchyOVGNodes(
        ovg,
        (node) => {
          if (x) node.X = -node.X;
          if (y) node.Y = -node.Y;
        },
        (d) => mirrorPortDirection(d, x, y),
      );
      mirrored = true;
      guard.Check();
    }
    guard.Add(BigInt(nodes.length));
    if (IsHorizontal(direction) || nodes.some((n) => n.IsTable())) {
      reserveHierarchyTransform(ovg, nodes.length, guard);
      transposeOVG(ovg);
      transposed = true;
      guard.Check();
    }
    addNodesIntersections(ovg, g, guard);
    addHierarchyLevelNodes(ovg, g, h, guard);
    const [tl, br] = ovgBoundingBox(ovg, guard);
    addNewBoundaryLayers(ovg, g, tl, br, guard);
    addCornerNodes(ovg, g, tl, br, guard);
    guard.Check();
    return ovg;
  } finally {
    if (transposed) transposeOVG(ovg);
    if (mirrored) {
      const x = direction === O.Left,
        y = direction === O.Top;
      for (const node of nodes) mirrorNode(node, x, y);
      transformHierarchyOVGNodes(
        ovg,
        (node) => {
          if (x) node.X = -node.X;
          if (y) node.Y = -node.Y;
        },
        (d) => mirrorPortDirection(d, x, y),
      );
    }
  }
}
