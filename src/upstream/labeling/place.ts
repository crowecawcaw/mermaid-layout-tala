// Translated from internal/labeling/placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { MaxLabelPlacementWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Kind } from '../nodeshape/kind.js';
import { Position as P, IsOutside, PADDING } from '../label/label.js';
import { covers } from '../layoutgraph/node-spatial.js';
import {
  LabelTopLeft,
  IconSize,
  InnerBox,
} from '../layoutgraph/node-geometry.js';
import { ValidatePositionedGraphSelection } from '../layoutgraph/positioned-validation.js';
import {
  labelPositionPreferences,
  labelPositionPreferenceTranches,
  compareLabelPositions,
} from './model.js';
import {
  LabelPlacementWorkGuard,
  captureLabelPlacement,
  nodeOverlapCount,
  partialNodeOverlapCount,
  edgeOverlapCount,
  collectLabelPlacementAncestors,
  edgeLabelTopLeft,
  positionedArrowheadLabel,
  sortLabelPlacementEdges,
} from './guard.js';
import {
  findSharedSegmentsChecked,
  scoreNodeLabelOverlaps,
} from './shared-segments.js';
import { findBestEdgeLabelPosition } from './edge-placement.js';
function fakeNode(
  g: Graph,
  topLeft: import('../geo/point.js').Point | null,
  width: number,
  height: number,
  text: string | null = null,
): Node {
  const n = new Node(0n, width, height);
  n.TopLeft = topLeft;
  n.Graph = g;
  n.D2ID = text;
  n.SetShape('Square');
  return n;
}
function fakeArrowheads(
  g: Graph,
  edge: Edge,
  guard: LabelPlacementWorkGuard,
  placed: Node[],
): void {
  for (const target of [false, true]) {
    const label = target
      ? edge.TargetArrowheadLabel
      : edge.SourceArrowheadLabel;
    if (!label) continue;
    const value = positionedArrowheadLabel(edge, target, guard)!;
    placed.push(
      fakeNode(
        g,
        value.Box.TopLeft,
        value.Box.Width,
        value.Box.Height,
        label.Text,
      ),
    );
  }
}
function fakeEdgeLabel(
  g: Graph,
  edge: Edge,
  guard: LabelPlacementWorkGuard,
): Node {
  const label = edge.Label!;
  return fakeNode(
    g,
    edgeLabelTopLeft(edge, label.Position, label.Width, label.Height, guard),
    label.Width,
    label.Height,
    label.Text,
  );
}
function sharedFakeNodes(g: Graph, guard: LabelPlacementWorkGuard): Node[] {
  const segments = findSharedSegmentsChecked(g.Edges, () => guard.step()),
    nodes: Node[] = [];
  for (let i = 0; i < segments.length; i++) {
    guard.step();
    const seg = segments[i]!,
      tl = seg.Start.Copy();
    let width = seg.End.X - seg.Start.X,
      height = seg.End.Y - seg.Start.Y;
    const clearance = 2.5 * PADDING;
    if (seg.End.X === seg.Start.X) {
      width = 2 * clearance;
      tl.X -= clearance;
    } else {
      height = 2 * clearance;
      tl.Y -= clearance;
    }
    nodes.push(fakeNode(g, tl, width, height, `fake_shared_segment_${i}`));
  }
  return nodes;
}
function placeEdgeLabels(
  g: Graph,
  edges: Edge[],
  placed: Node[],
  guard: LabelPlacementWorkGuard,
): void {
  const shared = sharedFakeNodes(g, guard),
    candidates: Edge[] = [];
  for (const edge of edges) {
    guard.step();
    if (edge.Label && !edge.IsLoop() && !edge.Label.PositionFixed())
      candidates.push(edge);
  }
  for (const edge of sortLabelPlacementEdges(candidates, guard)) {
    guard.step();
    const [fake, position, percentage] = findBestEdgeLabelPosition(
      edge,
      g,
      placed,
      shared,
      guard,
    );
    placed.push(fake!);
    edge.Label!.Position = position;
    edge.LabelPercentage = percentage;
  }
  guard.check();
}
export function Place(ctx: Context, g: Graph): void {
  placeWithLimit(ctx, g, MaxLabelPlacementWorkUnits);
}
export function placeWithLimit(ctx: Context, g: Graph, limit: bigint): void {
  const location = 'PlaceLabels';
  ValidatePositionedGraphSelection(ctx, location, g, []);
  const snapshot = captureLabelPlacement(g, []);
  let complete = false;
  try {
    const guard = new LabelPlacementWorkGuard(ctx, location, limit),
      placed: Node[] = [];
    for (const e of g.Edges) {
      guard.step();
      fakeArrowheads(g, e, guard, placed);
    }
    for (const e of g.Edges) {
      guard.step();
      if (e.Label && (e.IsLoop() || e.Label.PositionFixed()))
        placed.push(fakeEdgeLabel(g, e, guard));
    }
    for (const node of g.Nodes) {
      guard.step();
      let siblings: Node[] = [];
      for (const n of g.Containers.get(node.Container) ?? []) {
        guard.step();
        if (n !== node) siblings.push(n);
      }
      if (node.isContainer)
        for (const child of g.Containers.get(node) ?? []) {
          guard.step();
          siblings.push(child);
        }
      const ancestors = collectLabelPlacementAncestors(node, guard);
      let bestIcon = P.Unset,
        bestFake: Node | null = null,
        bestScore = Infinity;
      if (node.Icon && node.ShapeType() !== 'Image') {
        if (!node.Icon.PositionFixed())
          for (const position of labelPositionPreferences(node)) {
            guard.step();
            const size = IconSize(node, position),
              fake = fakeNode(
                g,
                LabelTopLeft(node, position, size, size),
                size,
                size,
              );
            let nodeset = siblings;
            if (node.Label?.PositionFixed()) {
              const l = node.Label;
              nodeset = [
                ...nodeset,
                fakeNode(
                  g,
                  LabelTopLeft(node, l.Position, l.Width, l.Height),
                  l.Width,
                  l.Height,
                  l.Text,
                ),
              ];
            }
            const score = scoreNodeLabelOverlaps(
              nodeOverlapCount(fake, nodeset, 0, guard),
              edgeOverlapCount(fake, g.Edges, 0, guard),
              nodeOverlapCount(fake, placed, 0, guard),
            );
            if (score < bestScore) {
              bestIcon = position;
              bestFake = fake;
              bestScore = score;
              if (score === 0) break;
            }
          }
        else {
          const size = IconSize(node, node.Icon.Position);
          bestFake = fakeNode(
            g,
            LabelTopLeft(node, node.Icon.Position, size, size),
            size,
            size,
          );
          bestIcon = node.Icon.Position;
        }
        guard.step();
        placed.push(bestFake!);
        node.Icon.Position = bestIcon;
      }
      if (!node.Label || node.Label.PositionFixed()) continue;
      if (node.Icon && node.ShapeType() !== 'Image') {
        const size = IconSize(node, node.Icon.Position);
        siblings = [
          ...siblings,
          fakeNode(
            g,
            LabelTopLeft(node, node.Icon.Position, size, size),
            size,
            size,
          ),
        ];
      }
      bestScore = Infinity;
      let bestPosition = P.Unset;
      const candidate = (
        position: P,
        width: number,
        height: number,
      ): Node | null => {
        const fake = fakeNode(
          g,
          LabelTopLeft(node, position, width, height),
          width,
          height,
          node.Label!.Text,
        );
        if (!IsOutside(position)) {
          fake.TopLeft!.X -= PADDING;
          fake.TopLeft!.Y -= PADDING;
          fake.Width += 2 * PADDING;
          fake.Height += 2 * PADDING;
          if (!covers(InnerBox(node), fake.Box)) return null;
          fake.TopLeft!.X += PADDING;
          fake.TopLeft!.Y += PADDING;
          fake.Width -= 2 * PADDING;
          fake.Height -= 2 * PADDING;
        }
        return fake;
      };
      const score = (fake: Node) =>
        scoreNodeLabelOverlaps(
          nodeOverlapCount(fake, siblings, PADDING, guard) +
            partialNodeOverlapCount(fake, ancestors, PADDING, guard),
          edgeOverlapCount(fake, g.Edges, PADDING - 1, guard),
          nodeOverlapCount(fake, placed, PADDING, guard),
        );
      for (const tranche of labelPositionPreferenceTranches(node)) {
        guard.step();
        let tied: P[] = [],
          tiedNodes: Node[] = [];
        for (const position of tranche) {
          guard.step();
          if (position === bestIcon) continue;
          const fake = candidate(position, node.Label.Width, node.Label.Height);
          if (!fake) continue;
          const value = score(fake);
          if (value < bestScore) {
            bestPosition = position;
            bestFake = fake;
            bestScore = value;
            if (IsOutside(position) && IsOutside(bestPosition)) {
              tied = [position];
              tiedNodes = [fake];
            } else {
              tied = [];
              tiedNodes = [];
            }
          } else if (
            value === bestScore &&
            compareLabelPositions(node, position, bestPosition) === 0 &&
            IsOutside(bestPosition) &&
            IsOutside(position)
          ) {
            tied.push(position);
            tiedNodes.push(fake);
          }
        }
        if (tied.length > 1) {
          let tieScore = Infinity,
            tiePosition = P.Unset,
            tieNode: Node | null = null;
          for (let i = 0; i < tied.length; i++) {
            guard.step();
            const position = tied[i]!,
              fake = candidate(
                position,
                node.Label.Width * 2,
                node.Label.Height * 2,
              );
            if (!fake) continue;
            const value = score(fake);
            if (value < tieScore) {
              tieScore = value;
              tiePosition = position;
              tieNode = tiedNodes[i]!;
            }
          }
          bestPosition = tiePosition;
          bestFake = tieNode;
        }
      }
      guard.step();
      placed.push(bestFake!);
      node.Label.Position = bestPosition;
    }
    placeEdgeLabels(g, g.Edges, placed, guard);
    complete = true;
  } finally {
    if (!complete) snapshot.restore();
  }
}
export function PlaceNewEdges(ctx: Context, g: Graph, edges: Edge[]): void {
  placeNewEdgesWithLimit(ctx, g, edges, MaxLabelPlacementWorkUnits);
}
export function placeNewEdgesWithLimit(
  ctx: Context,
  g: Graph,
  edges: Edge[],
  limit: bigint,
): void {
  const location = 'PlaceNewEdgeLabels';
  ValidatePositionedGraphSelection(ctx, location, g, edges);
  const snapshot = captureLabelPlacement(g, edges);
  let complete = false;
  try {
    const guard = new LabelPlacementWorkGuard(ctx, location, limit),
      placed: Node[] = [],
      newEdges = new Set<Edge>();
    for (const edge of edges) {
      guard.step();
      newEdges.add(edge);
    }
    for (const e of g.Edges) {
      guard.step();
      fakeArrowheads(g, e, guard, placed);
      if (!e.Label || e.IsLoop()) continue;
      if (newEdges.has(e) && !e.Label.PositionFixed()) continue;
      placed.push(fakeEdgeLabel(g, e, guard));
    }
    for (const e of g.Edges) {
      guard.step();
      if (e.IsLoop() && e.Label) placed.push(fakeEdgeLabel(g, e, guard));
    }
    for (const node of g.Nodes) {
      guard.step();
      if (node.Icon && node.ShapeType() !== 'Image') {
        const size = IconSize(node, node.Icon.Position);
        placed.push(
          fakeNode(
            g,
            LabelTopLeft(node, node.Icon.Position, size, size),
            size,
            size,
          ),
        );
      }
      if (!node.Label || node.Label.PositionFixed()) continue;
      const label = node.Label;
      placed.push(
        fakeNode(
          g,
          LabelTopLeft(node, label.Position, label.Width, label.Height),
          label.Width,
          label.Height,
          label.Text,
        ),
      );
    }
    placeEdgeLabels(g, edges, placed, guard);
    complete = true;
  } finally {
    if (!complete) snapshot.restore();
  }
}
