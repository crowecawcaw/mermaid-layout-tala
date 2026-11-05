// Translated OVG Cartesian intersections and fixed-overlap discovery from
// internal/routing/ovg{,_resource}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { MinPortClearance } from '../layoutgraph/geometry-policy.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import {
  routeSearchIsDescendantOf,
  routeSearchHasFixedAncestor,
} from './search-guard.js';
import { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import {
  checkedOVGIntersectionCount,
  type OVGBuildGuard,
} from './ovg-resource.js';
import { OVGPointProximityIndex } from './ovg-boundaries.js';
import { OVGPortIndex, hasUnobstructedLineToPorts } from './ovg-port-index.js';
interface CacheEntry {
  graph: Graph;
  nodes: Node[];
  overlaps: Set<Node>;
}
const caches = new WeakMap<OVG, CacheEntry[]>();
export function fixedOverlapsForBuild(
  ovg: OVG,
  graph: Graph,
  nodes: Node[],
  guard: OVGBuildGuard,
): Set<Node> {
  const entries = caches.get(ovg) ?? [];
  for (const entry of entries) {
    guard.Step();
    let same = entry.nodes.length === nodes.length;
    if (!same) guard.Check();
    else {
      for (let i = 0; i < nodes.length; i++) {
        guard.Step();
        if (entry.nodes[i] !== nodes[i]) {
          same = false;
          break;
        }
      }
      if (same) guard.Check();
    }
    if (entry.graph === graph && same) return entry.overlaps;
  }
  const fixed: Node[] = [];
  for (const node of nodes) {
    guard.Step();
    if (routeSearchHasFixedAncestor(guard, node)) fixed.push(node);
  }
  const overlaps = new Set<Node>();
  for (const node of fixed) {
    if (overlaps.has(node)) continue;
    for (const other of nodes) {
      guard.Step();
      const below = routeSearchIsDescendantOf(guard, node, other),
        otherBelow = routeSearchIsDescendantOf(guard, other, node);
      if (node === other || below || otherBelow) continue;
      if (node.Box.Overlaps(other.Box)) {
        overlaps.add(node);
        if (routeSearchHasFixedAncestor(guard, other)) overlaps.add(other);
        break;
      }
    }
  }
  entries.push({ graph, nodes: [...nodes], overlaps });
  caches.set(ovg, entries);
  return overlaps;
}
export function addNodesIntersections(
  ovg: OVG,
  g: Graph,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const xs = new Set<number>(),
    ys = new Set<number>();
  for (const node of ovg.Nodes) {
    guard.Step();
    xs.add(node.X);
    ys.add(node.Y);
  }
  addIntersections(ovg, g, xs, ys, guard);
}
export function addIntersections(
  ovg: OVG,
  g: Graph,
  xs: Set<number>,
  ys: Set<number>,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const candidateCount = checkedOVGIntersectionCount(
    BigInt(xs.size),
    BigInt(ys.size),
  );
  guard.reserveCandidates(candidateCount);
  guard.Add(candidateCount);
  const xOrder: number[] = [];
  for (const x of xs) {
    guard.Check();
    xOrder.push(x);
  }
  guard.reserveSortWork(xOrder.length);
  xOrder.sort((a, b) => a - b);
  const yOrder: number[] = [];
  for (const y of ys) {
    guard.Check();
    yOrder.push(y);
  }
  guard.reserveSortWork(yOrder.length);
  yOrder.sort((a, b) => a - b);
  const fixed = fixedOverlapsForBuild(ovg, g, g.Nodes, guard),
    portIndex = new OVGPortIndex(ovg.Ports, g, fixed, guard),
    proximityIndex = new OVGPointProximityIndex(g, xOrder, guard);
  for (const x of xOrder) {
    guard.Check();
    for (const y of yOrder) {
      guard.Check();
      if (portIndex.tooClose(x, y, MinPortClearance, guard)) continue;
      guard.Step();
      if (proximityIndex.pointNear(x, y, guard)) continue;
      const candidate = new OVGNode(new Point(x, y));
      if (hasUnobstructedLineToPorts(candidate, ovg, portIndex, 2, guard))
        guard.addNode(ovg, new OVGNode(new Point(x, y)));
    }
  }
  guard.Check();
}
