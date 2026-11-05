// Translated from internal/routing/tunnel.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import {
  IsBlocked,
  isVisibilityGraphCandidate,
} from '../layoutgraph/node-spatial.js';
import { routeSearchIsDescendantOf } from './search-guard.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import type { OVGNode } from './ovg-node.js';
export class TunnelEntry {
  constructor(
    public Node: Node,
    public OVGNode: OVGNode,
  ) {
    OVGNode.addPortMetadata(Node, { directions: 0, isCenterPort: false });
  }
}
export class Tunnel {
  constructor(
    public EntryA: TunnelEntry,
    public EntryB: TunnelEntry,
  ) {}
}
export class Range {
  constructor(
    public start: number,
    public end: number,
  ) {}
  length(): number {
    return this.end - this.start;
  }
}
interface TunnelGuard {
  Step(): void;
  Check(): void;
}
export function tunnelRangesBetweenChecked(
  g: Graph,
  a: Node,
  b: Node,
  filter: boolean,
  guard: TunnelGuard,
): [Range[] | null, boolean] {
  guard.Step();
  const horizontal = isVisibilityGraphCandidate(a, true, false, true, b, 0);
  if (!horizontal) {
    guard.Step();
    if (!isVisibilityGraphCandidate(a, false, false, true, b, 0))
      return [null, false];
  }
  let start: number, end: number;
  if (horizontal) {
    start = Math.max(a.TopLeft!.Y, b.TopLeft!.Y);
    end = Math.min(a.TopLeft!.Y + a.Height, b.TopLeft!.Y + b.Height);
  } else {
    let ar = a.TopLeft!.X + a.Width,
      br = b.TopLeft!.X + b.Width;
    if (a.Sequence && a.Sequence.Nodes.at(-1) !== a) ar -= 35;
    if (b.Sequence && b.Sequence.Nodes.at(-1) !== b) br -= 35;
    start = Math.max(a.TopLeft!.X, b.TopLeft!.X);
    end = Math.min(ar, br);
  }
  guard.Step();
  let ranges = [new Range(start, end)];
  for (const other of g.Nodes) {
    guard.Step();
    if (other === a || other === b) continue;
    const oa = routeSearchIsDescendantOf(guard, other, a),
      ao = routeSearchIsDescendantOf(guard, a, other),
      ob = routeSearchIsDescendantOf(guard, other, b),
      bo = routeSearchIsDescendantOf(guard, b, other);
    if (oa || ao || ob || bo) continue;
    if (
      IsBlocked(other, a, b, true, horizontal) ||
      IsBlocked(other, b, a, true, horizontal)
    )
      return [null, false];
    const p = horizontal ? other.TopLeft!.X : other.TopLeft!.Y,
      ap = horizontal ? a.TopLeft!.X : a.TopLeft!.Y,
      bp = horizontal ? b.TopLeft!.X : b.TopLeft!.Y;
    if (!((ap < p && p < bp) || (bp < p && p < ap))) continue;
    const next: Range[] = [];
    for (const r of ranges) {
      guard.Step();
      const lo = horizontal ? other.TopLeft!.Y : other.TopLeft!.X,
        hi = lo + (horizontal ? other.Height : other.Width);
      if (lo <= r.start && hi >= r.end) continue;
      if (lo > r.start && hi < r.end) {
        next.push(new Range(r.start, lo), new Range(hi, r.end));
        continue;
      }
      if (lo <= r.start && hi < r.end && hi > r.start) {
        next.push(new Range(hi, r.end));
        continue;
      }
      if (lo > r.start && hi >= r.end && lo < r.end) {
        next.push(new Range(r.start, lo));
        continue;
      }
      next.push(r);
    }
    ranges = [];
    guard.Check();
    for (const r of next) {
      guard.Step();
      if (!filter || r.length() >= 40) ranges.push(r);
    }
  }
  return [ranges, horizontal];
}
export function tunnelRangesBetween(
  g: Graph,
  a: Node,
  b: Node,
  filter: boolean,
  guard: OVGBuildGuard,
): [Range[] | null, boolean] {
  guard.Check();
  return tunnelRangesBetweenChecked(g, a, b, filter, guard);
}
export function buildTunnelsBetween(
  g: Graph,
  a: Node,
  b: Node,
  guard: OVGBuildGuard,
): Tunnel[] | null {
  guard.Check();
  const ab = routeSearchIsDescendantOf(guard, a, b),
    ba = routeSearchIsDescendantOf(guard, b, a);
  if (ab || ba) return null;
  const [ranges, horizontal] = tunnelRangesBetween(g, a, b, true, guard);
  if (ranges === null) return null;
  let edgesToFit = 0;
  for (const edge of a.Edges) {
    guard.Step();
    if (a.Adjacent(edge) === b) edgesToFit++;
  }
  const tunnels: Tunnel[] = [];
  for (const r of ranges) {
    guard.Step();
    const fit = Math.min(Math.floor((r.end - r.start) / 40), edgesToFit);
    for (let i = 1; i <= fit; i++) {
      guard.Step();
      const val = Round(r.start + (i * (r.end - r.start)) / (fit + 1));
      const na = guard.newDerivedNode(
          horizontal ? new Point(0, val) : new Point(val, 0),
        ),
        nb = guard.newDerivedNode(
          horizontal ? new Point(0, val) : new Point(val, 0),
        );
      guard.Step();
      const tunnel = new Tunnel(new TunnelEntry(a, na), new TunnelEntry(b, nb));
      if (horizontal) {
        if (a.TopLeft!.X > b.TopLeft!.X) {
          na.X = a.TopLeft!.X;
          nb.X = b.TopLeft!.X + b.Width;
        } else {
          na.X = a.TopLeft!.X + a.Width;
          nb.X = b.TopLeft!.X;
        }
      } else {
        if (a.TopLeft!.Y > b.TopLeft!.Y) {
          na.Y = a.TopLeft!.Y;
          nb.Y = b.TopLeft!.Y + b.Height;
        } else {
          na.Y = a.TopLeft!.Y + a.Height;
          nb.Y = b.TopLeft!.Y;
        }
      }
      tunnels.push(tunnel);
      edgesToFit--;
    }
  }
  return tunnels;
}
export function buildTunnels(g: Graph, guard: OVGBuildGuard): Tunnel[] {
  guard.Check();
  const out: Tunnel[] = [],
    special = new Set<Node>();
  for (const cluster of g.Clusters.values()) {
    guard.Step();
    for (const n of cluster.Nodes) {
      guard.Step();
      special.add(n);
    }
  }
  for (const node of g.NodeToTree.keys()) {
    guard.Step();
    special.add(node);
  }
  const searched = new Map<Node, Set<Node>>();
  for (const node of g.Nodes) {
    guard.Step();
    if (special.has(node) || node.IsTable()) continue;
    if (!searched.has(node)) searched.set(node, new Set());
    for (const edge of node.Edges) {
      guard.Step();
      const adjacent = node.Adjacent(edge);
      if (adjacent === node || special.has(adjacent)) continue;
      if (!searched.has(adjacent)) searched.set(adjacent, new Set());
      if (searched.get(node)!.has(adjacent)) continue;
      searched.get(node)!.add(adjacent);
      searched.get(adjacent)!.add(node);
      out.push(...(buildTunnelsBetween(g, node, adjacent, guard) ?? []));
    }
  }
  return out;
}
