// Translated from internal/layoutgraph/{cluster,sequence}.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Graph } from './graph.js';
import type { Cluster, Sequence } from './records.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { New as invariant } from '../invariant/errors.js';
import { moveNodeWithChildren } from './containment.js';
import { positionContainerChildren } from './node-geometry.js';
export interface SharedWorkStepper {
  Step(): void;
  Finish(): void;
}
export interface ClusterGeometryWork extends SharedWorkStepper {
  MoveNodeWithChildren(node: Node, dx: number, dy: number): void;
  PositionContainerChildren(node: Node): void;
}
export const unmeteredGroupGeometry: ClusterGeometryWork = {
  Step() {},
  Finish() {},
  MoveNodeWithChildren: moveNodeWithChildren,
  PositionContainerChildren(n) {
    positionContainerChildren(n, false);
  },
};
export function clusterMaximumsWithWork(
  c: Cluster,
  work: SharedWorkStepper,
): [number, number] {
  let maxWidth = 0,
    maxHeight = 0;
  for (const node of c.Nodes) {
    work.Step();
    if (node === null) throw invariant('cluster contains a nil node');
    maxWidth = Math.max(maxWidth, node.Width);
  }
  for (const node of c.Nodes) {
    work.Step();
    maxHeight = Math.max(maxHeight, node.Height);
  }
  work.Finish();
  return [maxWidth, maxHeight];
}
export function clusterResizeWithWork(
  c: Cluster,
  vessel: Node,
  work: SharedWorkStepper,
): void {
  if (c === null || vessel === null)
    throw invariant('cluster is missing its vessel');
  if (!c.FixedSize) {
    const [width, height] = clusterMaximumsWithWork(c, work);
    for (const node of c.Nodes) {
      work.Step();
      node.Width = width;
      node.Height = height;
    }
  }
  const [width, height] = clusterMaximumsWithWork(c, work);
  if (c.Arrangement === 'Row') {
    vessel.Width = width * c.Nodes.length + c.Padding * (c.Nodes.length - 1);
    vessel.Height = height;
  }
  if (c.Arrangement === 'Column') {
    vessel.Width = width;
    vessel.Height = height * c.Nodes.length + c.Padding * (c.Nodes.length - 1);
  }
}
export function clusterArrangeNodesWithWork(
  c: Cluster,
  work: ClusterGeometryWork,
): void {
  if (c.Vessel!.TopLeft === null) {
    work.Finish();
    return;
  }
  if (c.Arrangement === 'Row') {
    let position = c.Vessel!.TopLeft.X;
    const vesselCenter = c.Vessel!.TopLeft.Y + c.Vessel!.Height / 2;
    for (const node of c.Nodes) {
      work.Step();
      if (node.TopLeft !== null) {
        const dx = position - node.TopLeft.X,
          dy = Round(vesselCenter - (node.TopLeft.Y + node.Height / 2));
        work.MoveNodeWithChildren(node, dx, dy);
      } else {
        node.TopLeft = new Point(
          position,
          Round(vesselCenter - node.Height / 2),
        );
        work.PositionContainerChildren(node);
      }
      position += node.Width + c.Padding;
    }
  }
  if (c.Arrangement === 'Column') {
    let position = c.Vessel!.TopLeft.Y;
    const vesselCenter = c.Vessel!.TopLeft.X + c.Vessel!.Width / 2;
    for (const node of c.Nodes) {
      work.Step();
      if (node.TopLeft !== null) {
        const dx = Round(vesselCenter - (node.TopLeft.X + node.Width / 2)),
          dy = position - node.TopLeft.Y;
        work.MoveNodeWithChildren(node, dx, dy);
      } else {
        node.TopLeft = new Point(
          Round(vesselCenter - node.Width / 2),
          position,
        );
        work.PositionContainerChildren(node);
      }
      position += node.Height + c.Padding;
    }
  }
  work.Finish();
}
export function clusterSyncGeometryWithWork(
  c: Cluster,
  work: ClusterGeometryWork,
): void {
  if (work === null)
    throw invariant('cluster geometry requires work accounting');
  work.Step();
  if (c === null || c.Vessel === null)
    throw invariant('cluster is missing its vessel');
  clusterResizeWithWork(c, c.Vessel, work);
  clusterArrangeNodesWithWork(c, work);
}
export function SequenceAdvance(width: number): number {
  if (width <= 0) return 0;
  let wedge = 35;
  if (width <= wedge) wedge = width / 2;
  return width - wedge;
}
export function sequenceResizeWithWork(
  s: Sequence,
  work: SharedWorkStepper,
): void {
  let width = 0,
    offset = 0,
    height = 0;
  for (const n of s.Nodes) {
    work.Step();
    if (n === null) throw invariant('sequence contains a nil step');
    width = Math.max(width, offset + Math.max(0, n.Width));
    offset += SequenceAdvance(n.Width);
    height = Math.max(height, Math.max(0, n.Height));
  }
  s.Vessel!.Width = width;
  s.Vessel!.Height = height;
}
export function sequenceArrangeStepsWithWork(
  s: Sequence,
  work: SharedWorkStepper,
): void {
  if (s.Vessel!.TopLeft === null) {
    work.Finish();
    return;
  }
  const tl = s.Vessel!.TopLeft.Copy();
  for (const n of s.Nodes) {
    work.Step();
    n.TopLeft = tl.Copy();
    tl.X += SequenceAdvance(n.Width);
  }
  work.Finish();
}
export function sequenceSyncGeometryWithWork(
  s: Sequence,
  work: SharedWorkStepper,
): void {
  if (work === null)
    throw invariant('sequence geometry requires work accounting');
  work.Step();
  if (s === null || s.Vessel === null)
    throw invariant('sequence is missing its vessel');
  sequenceResizeWithWork(s, work);
  sequenceArrangeStepsWithWork(s, work);
}
export function sequencePlaceVessel(s: Sequence): void {
  const topLeft = new Point(Infinity, Infinity);
  for (const node of s.Nodes) {
    if (node.TopLeft === null) return;
    topLeft.X = Math.min(topLeft.X, node.TopLeft.X);
    topLeft.Y = Math.min(topLeft.Y, node.TopLeft.Y);
  }
  s.Vessel!.TopLeft = topLeft;
}
export function rdfsWalk(n: Node, apply: (node: Node) => void): void {
  if (n.isContainer)
    for (const child of n.Graph!.Containers.get(n) ?? [])
      rdfsWalk(child, apply);
  if (n.isClusterVessel)
    for (const cn of n.Graph!.Clusters.get(n)!.Nodes) rdfsWalk(cn, apply);
  else if (n.Graph!.Sequences.has(n))
    for (const step of n.Graph!.Sequences.get(n)!.Nodes) rdfsWalk(step, apply);
  apply(n);
}
export function dfsWalk(n: Node, apply: (node: Node) => boolean): boolean {
  if (apply(n)) return true;
  if (n.isContainer)
    for (const child of n.Graph!.Containers.get(n) ?? [])
      if (dfsWalk(child, apply)) return true;
  if (n.isClusterVessel) {
    for (const cn of n.Graph!.Clusters.get(n)!.Nodes)
      if (dfsWalk(cn, apply)) return true;
  } else if (n.Graph!.Sequences.has(n))
    for (const step of n.Graph!.Sequences.get(n)!.Nodes)
      if (dfsWalk(step, apply)) return true;
  return false;
}
export function SyncClusters(g: Graph): void {
  if (g.Clusters.size === 0) return;
  for (const n of g.Nodes)
    rdfsWalk(n, (node) => {
      if (node.isClusterVessel)
        clusterSyncGeometryWithWork(
          g.Clusters.get(node)!,
          unmeteredGroupGeometry,
        );
    });
}
export function SyncSequences(g: Graph): void {
  if (g.Sequences.size === 0) return;
  for (const n of g.Nodes)
    rdfsWalk(n, (node) => {
      if (g.Sequences.has(node))
        sequenceSyncGeometryWithWork(
          g.Sequences.get(node)!,
          unmeteredGroupGeometry,
        );
    });
}
