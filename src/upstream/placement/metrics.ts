// Translated internal/placement/metrics.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import { MaxGraphSize } from '../limits/work.js';
import { Slice } from '../gosort/slice.js';

export function occupied(
  graph: Graph,
  point: Point | null,
): [Node | null, boolean] {
  for (const node of graph.Nodes)
    if (node.TopLeft !== null && point !== null && node.TopLeft.Equals(point))
      return [node, true];
  return [null, false];
}
export function withinMaxSize(graph: Graph): boolean {
  const [tl, br] = BoundingBox(graph);
  return br!.X - tl!.X <= MaxGraphSize && br!.Y - tl!.Y <= MaxGraphSize;
}
export function intersectsOtherNode(
  graph: Graph,
  first: Node,
  second: Node,
): boolean {
  const a = first.Center(),
    b = second.Center();
  for (const other of graph.Nodes) {
    if (other === first || other === second) continue;
    if (isDescendantOf(first, other) || isDescendantOf(second, other)) continue;
    if (isDescendantOf(other, first) || isDescendantOf(other, second)) continue;
    if (passesThrough(other, a, b)) return true;
  }
  return false;
}
export function median(nodes: Node[], includeSizes: boolean): [number, number] {
  const byX = [...nodes],
    byY = [...nodes];
  Slice(byX, (a, b) => {
    let x = a.TopLeft!.X,
      y = b.TopLeft!.X;
    if (includeSizes) {
      x += a.Width / 2;
      y += b.Width / 2;
    }
    return x === y ? a.ID < b.ID : x < y;
  });
  Slice(byY, (a, b) => {
    let x = a.TopLeft!.Y,
      y = b.TopLeft!.Y;
    if (includeSizes) {
      x += a.Height / 2;
      y += b.Height / 2;
    }
    return x === y ? a.ID < b.ID : x < y;
  });
  const mid = Math.floor(nodes.length / 2);
  if (includeSizes) {
    let x = byX[mid]!.TopLeft!.X + byX[mid]!.Width / 2,
      y = byY[mid]!.TopLeft!.Y + byY[mid]!.Height / 2;
    if (nodes.length % 2 === 0) {
      x = (x + byX[mid - 1]!.TopLeft!.X + byX[mid - 1]!.Width / 2) / 2;
      y = (y + byY[mid - 1]!.TopLeft!.Y + byY[mid - 1]!.Height / 2) / 2;
    }
    return [x / nodes[0]!.Graph!.CellSize, y / nodes[0]!.Graph!.CellSize];
  }
  let x = byX[mid]!.TopLeft!.X + 0.5,
    y = byY[mid]!.TopLeft!.Y + 0.5;
  if (nodes.length % 2 === 0) {
    x = (x + byX[mid - 1]!.TopLeft!.X) / 2;
    y = (y + byY[mid - 1]!.TopLeft!.Y) / 2;
  }
  return [x, y];
}
export function medianToNeighbors(
  node: Node,
  includeSizes: boolean,
  abductions: EdgeAbduction[] | null,
): [number, number] {
  return median(adjacents(node, abductions), includeSizes);
}
export function adjacents(
  node: Node,
  abductions: EdgeAbduction[] | null,
): Node[] {
  const result: Node[] = [],
    used = new Array<boolean>(abductions?.length ?? 0).fill(false),
    abs = abductions ?? [];
  for (const edge of node.Edges) {
    const adjacent = node.Adjacent(edge);
    if (adjacent.TopLeft === null) continue;
    let add = adjacent;
    for (let i = 0; i < abs.length; i++) {
      if (used[i]) continue;
      const ab = abs[i]!;
      if (
        ab.CurrentFrom === node &&
        ab.CurrentTo === adjacent &&
        ab.OriginallyTo !== null
      ) {
        used[i] = true;
        add = ab.OriginallyTo;
        break;
      }
      if (
        ab.CurrentFrom === adjacent &&
        ab.CurrentTo === node &&
        ab.OriginallyFrom !== null
      ) {
        used[i] = true;
        add = ab.OriginallyFrom;
        break;
      }
    }
    result.push(add);
  }
  if (result.length !== 0) return result;
  const resolve = (near: Node): Node => {
    if (near.Cluster !== null && near.Cluster.Vessel!.Graph !== null)
      near = near.Cluster.Vessel!;
    else if (near.Sequence !== null && near.Sequence.Vessel!.Graph !== null)
      near = near.Sequence.Vessel!;
    let tree = node.Graph!.NodeToTree.get(near);
    if (tree !== undefined) {
      while (tree.Parent !== null) tree = tree.Parent;
      near =
        tree.SentinelEdge!.From === tree.Node
          ? tree.SentinelEdge!.To
          : tree.SentinelEdge!.From;
    }
    return near;
  };
  for (const original of node.orderedNears()) {
    const near = resolve(original);
    if (near.TopLeft !== null && isDescendantOf(near, node.Container))
      result.push(near);
  }
  if (result.length !== 0) return result;
  const nears: Node[] = [];
  if (node.isClusterVessel)
    for (const child of node.Graph!.Clusters.get(node)!.Nodes)
      nears.push(...child.orderedNears());
  const sequence = node.Graph!.Sequences.get(node);
  if (sequence !== undefined)
    for (const child of sequence.Nodes) nears.push(...child.orderedNears());
  for (const tree of node.Graph!.Trees.get(node) ?? []) {
    const queue = [tree];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      nears.push(...current.Node.orderedNears());
      queue.push(...current.Children);
    }
  }
  for (const near of nears) {
    const add = resolve(near);
    if (add.TopLeft !== null) result.push(add);
  }
  return result;
}
