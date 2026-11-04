// Translated from internal/proximity/herding.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { HerdAssignment, type EdgeAbduction } from '../layoutgraph/records.js';
import {
  Orientation as O,
  GetOpposite,
  IsHorizontal,
  IsVertical,
  ToString,
} from '../geo/orientation.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import { New as invariant } from '../invariant/errors.js';
import { groupVessel, sortByID } from './nears.js';
function check(ctx: Context): void {
  const error = ctx.Err();
  if (error !== null)
    throw new Error(`AssignHerds: ${error.message}`, { cause: error });
}
export interface HerdComponent {
  nodes: Node[];
  uncles: Node[];
}
export function connectedHerds(
  ctx: Context,
  herdOrder: Node[],
  herds: Map<Node, Node[]>,
): HerdComponent[] {
  const byNode = new Map<Node, Node[]>();
  for (const uncle of herdOrder)
    for (const node of herds.get(uncle) ?? []) {
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node)!.push(uncle);
    }
  const seenUncles = new Set<Node>(),
    seenNodes = new Set<Node>(),
    components: HerdComponent[] = [];
  for (const uncle of herdOrder) {
    if (seenUncles.has(uncle)) continue;
    const component: HerdComponent = { uncles: [uncle], nodes: [] };
    seenUncles.add(uncle);
    for (let i = 0; i < component.uncles.length; i++) {
      check(ctx);
      for (const node of herds.get(component.uncles[i]!) ?? []) {
        if (seenNodes.has(node)) continue;
        seenNodes.add(node);
        component.nodes.push(node);
        for (const related of byNode.get(node) ?? []) {
          if (!seenUncles.has(related)) {
            seenUncles.add(related);
            component.uncles.push(related);
          }
        }
      }
    }
    components.push(component);
  }
  return components;
}
export function ApplyVirally(
  ctx: Context,
  herdOrder: Node[],
  herds: Map<Node, Node[]>,
): void {
  for (;;) {
    check(ctx);
    let end = true;
    for (const uncle of herdOrder) {
      check(ctx);
      const nodes = herds.get(uncle) ?? [];
      let assignment: HerdAssignment | null = null;
      for (const node of nodes) {
        if (
          node.HerdAssignment !== null &&
          node.HerdAssignment.Orientation !== O.NONE
        ) {
          assignment = node.HerdAssignment;
          break;
        }
      }
      if (assignment !== null) {
        for (const node of nodes) {
          if (node.HerdAssignment === null) {
            end = false;
            node.HerdAssignment = assignment.Copy();
          } else if (
            node.HerdAssignment.Orientation !== O.NONE &&
            node.HerdAssignment.Orientation !== assignment.Orientation
          )
            throw invariant(
              `node ${nodeDebugID(node)} has herd orientation ${ToString(node.HerdAssignment.Orientation)}; expected ${ToString(assignment.Orientation)}`,
            );
        }
      }
    }
    if (end) return;
  }
}
export function CanUseBothSides(node: Node, orientation: O): boolean {
  const isWide = node.Width >= 2 * node.Height,
    isTall = node.Height >= 2 * node.Width;
  return (
    ((orientation === O.Top || orientation === O.Bottom) && isWide) ||
    ((orientation === O.Left || orientation === O.Right) && isTall)
  );
}
export function descendantOf(
  node: Node | null,
  ancestor: Node | null,
): boolean {
  while (node !== null) {
    if (node === ancestor) return true;
    if (node.Container !== null) node = node.Container;
    else if (node.Cluster !== null) node = node.Cluster.Vessel;
    else if (node.Sequence !== null) node = node.Sequence.Vessel;
    else node = null;
  }
  return ancestor === null;
}
export function GroupSheep(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  abductions: EdgeAbduction[],
): [Map<Node, Node[]>, Map<Node, Map<Node, Node[]>>] {
  const byUncle = new Map<Node, Node[]>(),
    toCousin = new Map<Node, Map<Node, Node[]>>(),
    used = new Array<boolean>(abductions.length).fill(false);
  for (const node of graph.Containers.get(root) ?? []) {
    check(ctx);
    for (let i = 0; i < abductions.length; i++) {
      check(ctx);
      if (used[i]) continue;
      const abduction = abductions[i]!;
      if (abduction === null)
        throw invariant('herding has a nil edge abduction');
      const from = groupVessel(abduction.OriginallyFrom),
        to = groupVessel(abduction.OriginallyTo);
      let cousin: Node | null = null,
        current: Node | null = null;
      if (
        abduction.OriginallyTo !== null &&
        (from === node || descendantOf(from, node))
      ) {
        if (abduction.CurrentTo !== null && !abduction.CurrentTo.IsContainer())
          continue;
        if (to === null || to.container() === null) continue;
        cousin = to;
        current = abduction.CurrentTo;
      } else if (
        abduction.OriginallyFrom !== null &&
        (to === node || descendantOf(to, node))
      ) {
        if (
          abduction.CurrentFrom !== null &&
          !abduction.CurrentFrom.IsContainer()
        )
          continue;
        if (from === null || from.container() === null) continue;
        cousin = from;
        current = abduction.CurrentFrom;
      }
      if (cousin === null) continue;
      used[i] = true;
      while (cousin!.container() !== current) {
        if (cousin!.Cluster !== null) cousin = cousin!.Cluster.Vessel;
        else if (cousin!.Sequence !== null) cousin = cousin!.Sequence.Vessel;
        else cousin = cousin!.container();
      }
      const uncle = cousin!.container();
      if (uncle === null || !uncle.IsContainer()) continue;
      if (!toCousin.has(uncle)) toCousin.set(uncle, new Map());
      const cousins = toCousin.get(uncle)!;
      if (!cousins.has(node)) {
        if (!byUncle.has(uncle)) byUncle.set(uncle, []);
        byUncle.get(uncle)!.push(node);
        cousins.set(node, []);
      }
      cousins.get(node)!.push(cousin!);
    }
  }
  return [byUncle, toCousin];
}
export function AssignHerds(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  abductions: EdgeAbduction[],
): void {
  check(ctx);
  const [grouped, cousins] = GroupSheep(ctx, graph, root, abductions),
    uncleOrder: Node[] = [];
  for (const [uncle, nodes] of grouped) {
    if (nodes.length <= 1) {
      grouped.delete(uncle);
      cousins.delete(uncle);
    } else uncleOrder.push(uncle);
  }
  sortByID(uncleOrder);
  const components = connectedHerds(ctx, uncleOrder, grouped);
  let unbiasedSide = 0;
  for (const component of components) {
    let sides = [O.Top, O.Right, O.Bottom, O.Left],
      preferred = O.NONE;
    for (const uncle of component.uncles) {
      check(ctx);
      const children = graph.Containers.get(uncle) ?? [];
      if (children.length === 0)
        throw invariant(`herding uncle ${nodeDebugID(uncle)} has no children`);
      if (children[0]!.TopLeft === null) continue;
      for (const node of grouped.get(uncle) ?? [])
        for (const cousin of cousins.get(uncle)!.get(node) ?? []) {
          const assignment = cousin.HerdAssignment;
          if (assignment === null) continue;
          const orientation = assignment.Orientation;
          if (!IsHorizontal(orientation) && !IsVertical(orientation))
            throw invariant(
              `cousin ${nodeDebugID(cousin)} has an invalid herd orientation`,
            );
          const bothSides = CanUseBothSides(uncle, orientation);
          sides = sides.filter(
            (side) =>
              side === GetOpposite(orientation) ||
              (bothSides && side === orientation),
          );
          if (preferred === O.NONE) {
            preferred = GetOpposite(orientation);
            if (
              bothSides &&
              assignment.sameSidePaired.size <
                assignment.oppositeSidePaired.size
            )
              preferred = orientation;
          }
        }
    }
    if (sides.length === 0) {
      for (const node of component.nodes) node.HerdAssignment = null;
      continue;
    }
    if (preferred === O.NONE) {
      preferred = sides[unbiasedSide % sides.length]!;
      unbiasedSide++;
    } else if (!sides.includes(preferred)) preferred = sides[0]!;
    for (const node of component.nodes) {
      node.HerdAssignment = new HerdAssignment();
      node.HerdAssignment.Orientation = preferred;
    }
    for (const uncle of component.uncles) {
      if (graph.Containers.get(uncle)![0]!.TopLeft === null) continue;
      for (const node of grouped.get(uncle) ?? [])
        for (const cousin of cousins.get(uncle)!.get(node) ?? []) {
          if (cousin.HerdAssignment === null) continue;
          if (preferred === cousin.HerdAssignment.Orientation) {
            node.HerdAssignment!.sameSidePaired.add(uncle);
            cousin.HerdAssignment.sameSidePaired.add(uncle);
          } else {
            node.HerdAssignment!.oppositeSidePaired.add(uncle);
            cousin.HerdAssignment.oppositeSidePaired.add(uncle);
          }
        }
    }
  }
  ApplyVirally(ctx, uncleOrder, grouped);
  for (const uncle of uncleOrder)
    for (const node of grouped.get(uncle) ?? []) {
      if (node.HerdAssignment !== null && node.IsClusterVessel()) {
        const cluster = graph.Clusters.get(node)!;
        if (
          (node.HerdAssignment.Orientation === O.Top ||
            node.HerdAssignment.Orientation === O.Bottom) &&
          cluster.Arrangement === 'Column'
        )
          cluster.Arrangement = 'Row';
        else if (
          (node.HerdAssignment.Orientation === O.Left ||
            node.HerdAssignment.Orientation === O.Right) &&
          cluster.Arrangement === 'Row'
        )
          cluster.Arrangement = 'Column';
      }
    }
}
export function SyncHerdFences(graph: Graph): void {
  const [tl, br] = BoundingBox(graph);
  for (const node of graph.Nodes) {
    if (node.HerdAssignment === null || node.FixedTopLeft !== null) continue;
    switch (node.HerdAssignment.Orientation) {
      case O.Top:
        node.HerdAssignment.Val = tl!.Y;
        break;
      case O.Bottom:
        node.HerdAssignment.Val = br!.Y;
        break;
      case O.Left:
        node.HerdAssignment.Val = tl!.X;
        break;
      case O.Right:
        node.HerdAssignment.Val = br!.X;
        break;
    }
  }
}
