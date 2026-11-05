// Translated from internal/quality/{inspection,inspection_geometry,inspection_labels,evaluation_guard}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineTreeDepth } from '../limits/work.js';
import { Box } from '../geo/box.js';
import type { Point } from '../geo/point.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { ancestryParent } from '../layoutgraph/topology-preflight.js';
import { ValidatePositionedGraphSelection } from '../layoutgraph/positioned-validation.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { LabelTopLeft, IconSize } from '../layoutgraph/node-geometry.js';
import { Kind } from '../nodeshape/kind.js';
import { IsOutside, Position } from '../label/label.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import { countNonSharedCrossings } from './crossings.js';

export interface Metrics {
  NodeOverlaps: number;
  RouteObstructions: number;
  TextOcclusions: number;
  Crossings: number;
  Detour: number;
  RouteLength: number;
}
export function boxesOverlapWithPadding(
  a: Box,
  b: Box,
  padding: number,
): boolean {
  if (
    a.TopLeft.X >= b.TopLeft.X + b.Width + padding ||
    b.TopLeft.X >= a.TopLeft.X + a.Width + padding
  )
    return false;
  return (
    a.TopLeft.Y < b.TopLeft.Y + b.Height + padding &&
    b.TopLeft.Y < a.TopLeft.Y + a.Height + padding
  );
}
export function boxCovers(outer: Box, inner: Box): boolean {
  return (
    inner.TopLeft.X >= outer.TopLeft.X &&
    inner.TopLeft.Y >= outer.TopLeft.Y &&
    inner.TopLeft.X + inner.Width <= outer.TopLeft.X + outer.Width &&
    inner.TopLeft.Y + inner.Height <= outer.TopLeft.Y + outer.Height
  );
}
export function evaluationIsDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: WorkGuard,
): boolean {
  for (let depth = 0; ; depth++) {
    guard.Step();
    if (ancestor === descendant) return true;
    if (!descendant) return false;
    if (depth >= MaxEngineTreeDepth)
      throw new Error(
        `TALA Evaluate ancestry depth exceeds limit ${MaxEngineTreeDepth}`,
      );
    descendant = ancestryParent(descendant);
    if (!descendant) return ancestor === null;
  }
}
function endpointAncestor(edge: Edge, node: Node, guard: WorkGuard): boolean {
  return (
    evaluationIsDescendantOf(edge.From, node, guard) ||
    evaluationIsDescendantOf(edge.To, node, guard)
  );
}
export function segmentEntersBox(box: Box, a: Point, b: Point): boolean {
  if (box.Width <= 0 || box.Height <= 0 || (a.X === b.X && a.Y === b.Y))
    return false;
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.X, b.X - a.X, box.TopLeft.X, box.TopLeft.X + box.Width],
    [a.Y, b.Y - a.Y, box.TopLeft.Y, box.TopLeft.Y + box.Height],
  ] as [number, number, number, number][]) {
    if (delta === 0) {
      if (start <= min || start >= max) return false;
      continue;
    }
    let first = (min - start) / delta,
      last = (max - start) / delta;
    if (first > last) [first, last] = [last, first];
    low = Math.max(low, first);
    high = Math.min(high, last);
    if (low >= high) return false;
  }
  return low < high;
}
function measureGeometry(g: Graph, score: Metrics, guard: WorkGuard): void {
  for (let i = 0; i < g.Nodes.length; i++) {
    const node = g.Nodes[i]!;
    guard.Step();
    if (node.IsInvisible || !node.Shape.IsRectangular()) continue;
    for (let j = i + 1; j < g.Nodes.length; j++) {
      const other = g.Nodes[j]!;
      guard.Step();
      if (
        other.IsInvisible ||
        !other.Shape.IsRectangular() ||
        !boxesOverlapWithPadding(node.Box, other.Box, 0)
      )
        continue;
      if (
        !evaluationIsDescendantOf(node, other, guard) &&
        !evaluationIsDescendantOf(other, node, guard)
      )
        score.NodeOverlaps++;
    }
    for (const edge of g.Edges) {
      guard.Step();
      if (edge.IsInvisible || edge.IsCurve) continue;
      if (
        endpointAncestor(edge, node, guard) &&
        edge.From !== node &&
        edge.To !== node
      )
        continue;
      for (let j = 1; j < edge.Points.length; j++) {
        guard.Step();
        if (
          (j === 1 && edge.From === node) ||
          (j === edge.Points.length - 1 && edge.To === node)
        )
          continue;
        if (segmentEntersBox(node.Box, edge.Points[j - 1]!, edge.Points[j]!)) {
          score.RouteObstructions++;
          break;
        }
      }
    }
  }
}
function measureLabels(g: Graph, score: Metrics, guard: WorkGuard): void {
  guard.Step();
  const labels: { box: Box; node: Node | null; edge: Edge | null }[] = [];
  const append = (box: Box, node: Node | null, edge: Edge | null) => {
    if (box.Width > 0 && box.Height > 0) labels.push({ box, node, edge });
  };
  for (const node of g.Nodes) {
    guard.Step();
    if (node.IsInvisible) continue;
    if (node.Label && node.Label.Position !== Position.Unset) {
      if (IsOutside(node.Label.Position)) guard.Add(BigInt(4 * g.Nodes.length));
      append(
        new Box(
          LabelTopLeft(
            node,
            node.Label.Position,
            node.Label.Width,
            node.Label.Height,
          ),
          node.Label.Width,
          node.Label.Height,
        ),
        node,
        null,
      );
    }
    if (node.Icon && node.shapeType !== Kind.Image) {
      if (IsOutside(node.Icon.Position)) guard.Add(BigInt(4 * g.Nodes.length));
      const size = IconSize(node, node.Icon.Position);
      append(
        new Box(LabelTopLeft(node, node.Icon.Position, size, size), size, size),
        node,
        null,
      );
    }
  }
  const visible: Edge[] = [];
  for (const edge of g.Edges) {
    guard.Step();
    if (edge.IsInvisible) continue;
    visible.push(edge);
    if (edge.Points.length < 2) continue;
    if (edge.Label && edge.Label.Position !== Position.Unset) {
      guard.Add(BigInt(edge.Points.length));
      append(
        new Box(
          EdgeLabelTopLeft(
            edge,
            edge.Label.Position,
            edge.Label.Width,
            edge.Label.Height,
          )!,
          edge.Label.Width,
          edge.Label.Height,
        ),
        null,
        edge,
      );
    }
    if (edge.SourceArrowheadLabel) {
      guard.Add(BigInt(edge.Points.length));
      append(PositionArrowheadLabel(edge, false, edge.Points)!.Box, null, edge);
    }
    if (edge.TargetArrowheadLabel) {
      guard.Add(BigInt(edge.Points.length));
      append(PositionArrowheadLabel(edge, true, edge.Points)!.Box, null, edge);
    }
  }
  for (let i = 0; i < labels.length; i++) {
    const placed = labels[i]!;
    guard.Step();
    for (let j = 0; j < i; j++) {
      guard.Step();
      if (boxesOverlapWithPadding(placed.box, labels[j]!.box, 0))
        score.TextOcclusions++;
    }
    for (const node of g.Nodes) {
      guard.Step();
      if (
        node.IsInvisible ||
        !node.Shape.IsRectangular() ||
        !boxesOverlapWithPadding(placed.box, node.Box, 0)
      )
        continue;
      const ancestor = placed.node
        ? evaluationIsDescendantOf(placed.node, node, guard)
        : endpointAncestor(placed.edge!, node, guard) &&
          node !== placed.edge!.From &&
          node !== placed.edge!.To;
      if (ancestor && boxCovers(node.Box, placed.box)) continue;
      score.TextOcclusions++;
    }
    for (const edge of visible) {
      guard.Step();
      if (edge === placed.edge || edge.IsCurve) continue;
      let overlap = false;
      for (let j = 1; j < edge.Points.length; j++) {
        guard.Step();
        if (
          segmentEntersBox(placed.box, edge.Points[j - 1]!, edge.Points[j]!)
        ) {
          overlap = true;
          break;
        }
      }
      if (overlap) score.TextOcclusions++;
    }
  }
}
export function inspectWithLimit(
  ctx: Context,
  graph: Graph,
  workLimit: bigint,
): [Metrics, bigint] {
  if (!graph) throw new Error('cannot evaluate a nil graph');
  ValidatePositionedGraphSelection(ctx, 'Inspect', graph, []);
  const guard = new WorkGuard(ctx, 'Inspect', workLimit);
  const score: Metrics = {
    NodeOverlaps: 0,
    RouteObstructions: 0,
    TextOcclusions: 0,
    Crossings: 0,
    Detour: 0,
    RouteLength: 0,
  };
  let scale = 0,
    nodeCount = 0;
  for (const node of graph.Nodes) {
    guard.Step();
    if (!node.IsContainer() && !node.IsInvisible) {
      scale += (node.Width + node.Height) / 2;
      nodeCount++;
    }
  }
  scale = Math.max(1, scale / Math.max(1, nodeCount));
  const visible: Edge[] = [];
  for (const edge of graph.Edges) {
    guard.Step();
    if (edge.IsInvisible) continue;
    visible.push(edge);
    let length = 0;
    for (let i = 1; i < edge.Points.length; i++) {
      guard.Step();
      const a = edge.Points[i - 1]!,
        b = edge.Points[i]!;
      length += Math.hypot(b.X - a.X, b.Y - a.Y);
    }
    score.RouteLength += length / scale;
    if (edge.Points.length < 2 || edge.IsLoop()) continue;
    const first = edge.Points[0]!,
      last = edge.Points[edge.Points.length - 1]!,
      direct = Math.abs(last.X - first.X) + Math.abs(last.Y - first.Y);
    score.Detour += Math.max(0, length - direct) / Math.max(scale, direct);
  }
  score.Crossings = countNonSharedCrossings(visible, guard);
  measureGeometry(graph, score, guard);
  measureLabels(graph, score, guard);
  if (!Number.isFinite(score.RouteLength) || !Number.isFinite(score.Detour))
    throw new Error('TALA Inspect produced non-finite geometry');
  guard.Finish();
  return [score, guard.Used()];
}
export function Inspect(ctx: Context, graph: Graph): Metrics {
  return inspectWithLimit(ctx, graph, 50_000_000n)[0];
}
