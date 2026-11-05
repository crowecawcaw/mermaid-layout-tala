// Translated from internal/hierarchy/placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { BoundingBox } from '../graphbounds/bounds.js';
import {
  containerPadding,
  InsidePlacement,
  fitToBoundingBox,
} from '../layoutgraph/node-geometry.js';
import { MinPortClearance } from '../layoutgraph/geometry-policy.js';
import { CountSegmentCrossings } from '../layoutgraph/segment-crossing.js';
import { PlacementNode } from './placement-nodes.js';
import { crossLevelSegments } from './crossing.js';
const work = { Step() {}, Finish() {} };
export function minimumDistanceToNextLevel(
  nodes: PlacementNode[],
  horizontal: boolean,
): number {
  const crossings = CountSegmentCrossings(
    crossLevelSegments(nodes, false, true),
  );
  let maxLabel = 0;
  for (const node of nodes) {
    if (node.isDummy) continue;
    for (const e of node.graphNode!.Edges) {
      const adj = node.graphNode!.Adjacent(e);
      let from = node.graphNode!,
        to = adj;
      if (
        (to.Hierarchy!.Levels().get(to) ?? 0) <
        (from.Hierarchy!.Levels().get(from) ?? 0)
      )
        [from, to] = [to, from];
      if (
        (to.Hierarchy!.Levels().get(to) ?? 0) -
          (from.Hierarchy!.Levels().get(from) ?? 0) !==
        1
      )
        continue;
      if (e.Label)
        maxLabel = Math.max(
          horizontal ? e.Label.Width : e.Label.Height,
          maxLabel,
        );
    }
  }
  return Round(Math.min(Math.max(crossings * 50, maxLabel + 50, 50), 300));
}
export function placeDescendants(
  g: Graph,
  root: PlacementNode,
  tl: Point,
): void {
  if (!root.isContainer) return;
  const graphNode = root.graphNode!,
    padding = containerPadding(g, graphNode, true);
  let x = tl.X;
  for (const child of root.children) {
    child.graphNode!.TopLeft = new Point(x, tl.Y);
    placeDescendants(
      g,
      child,
      InsidePlacement(child.graphNode!, 1, 1, padding),
    );
    x += Math.ceil(child.graphNode!.Width) + 60;
  }
  const [a, b] = BoundingBox(g.Containers.get(graphNode) ?? [], work);
  fitToBoundingBox(graphNode, a, b, padding);
}
export function placeNodesByLevel(
  g: Graph,
  byLevel: Map<number, PlacementNode[]>,
  horizontal: boolean,
): void {
  let y = 0;
  for (let i = 0; i < byLevel.size; i++) {
    const level = byLevel.get(i)!,
      nodes: Node[] = [];
    let height = 0,
      x = 0;
    for (const pn of level) {
      const node = pn.graphNode!;
      nodes.push(node);
      node.TopLeft = new Point(x, y);
      if (!pn.isDummy) {
        const container = pn.container?.graphNode ?? null,
          padding = containerPadding(g, container, true);
        placeDescendants(g, pn, InsidePlacement(node, 1, 1, padding));
        height = Math.max(height, node.Height);
        x += Math.ceil(node.Width) + 60;
      } else x += 60;
    }
    y += Math.ceil(
      height +
        minimumDistanceToNextLevel(level, horizontal) +
        2 * MinPortClearance,
    );
    const [a, b] = BoundingBox(nodes, work),
      centerY = Math.ceil(a.Y + (b.Y - a.Y) / 2);
    for (const node of nodes)
      node.Translate(0, Math.ceil(centerY - node.Center().Y));
  }
}
