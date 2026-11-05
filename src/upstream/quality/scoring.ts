// Translated from internal/quality/{score,scoring,labels,evaluation_guard}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineTreeDepth } from '../limits/work.js';
import { Box } from '../geo/box.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import { ValidatePositionedGraphSelection } from '../layoutgraph/positioned-validation.js';
import {
  graphBoundingBox,
  EdgeLabelTopLeft,
} from '../layoutgraph/graph-bounds.js';
import { LabelTopLeft, IconSize } from '../layoutgraph/node-geometry.js';
import { Position, IsOutside, PADDING } from '../label/label.js';
import { Kind } from '../nodeshape/kind.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import {
  scoreNodeLabelOverlaps,
  scoreEdgeLabelOverlaps,
} from '../labeling/shared-segments.js';
import { countNonSharedCrossings } from './crossings.js';
import { evaluationIsDescendantOf } from './inspection.js';
import {
  nodeOverlapCount,
  partialNodeOverlapCount,
  boxOverlapCount,
  nodeOverlapArea,
  edgeOverlapCount,
  findSharedSegments,
} from './label-geometry.js';
const maxEvaluationWorkUnits = 50_000_000n;
function labelBox(edge: Edge): Box {
  const l = edge.Label!;
  return new Box(
    EdgeLabelTopLeft(edge, l.Position, l.Width, l.Height)!,
    l.Width,
    l.Height,
  );
}
export function scoreExistingLabelPlacements(
  g: Graph,
  guard: WorkGuard,
): number {
  guard.Step();
  const placed: Box[] = [];
  let total = 0;
  for (const edge of g.Edges) {
    guard.Step();
    if (edge.SourceArrowheadLabel) {
      guard.Add(BigInt(edge.Points.length));
      placed.push(PositionArrowheadLabel(edge, false, edge.Points)!.Box);
    }
    if (edge.TargetArrowheadLabel) {
      guard.Add(BigInt(edge.Points.length));
      placed.push(PositionArrowheadLabel(edge, true, edge.Points)!.Box);
    }
  }
  for (const edge of g.Edges) {
    guard.Step();
    if (edge.IsLoop() && edge.Label) {
      guard.Add(BigInt(edge.Points.length));
      placed.push(labelBox(edge));
    }
  }
  for (const node of g.Nodes) {
    guard.Step();
    if (node.Icon && node.shapeType !== Kind.Image) {
      const size = IconSize(node, node.Icon.Position),
        box = new Box(
          LabelTopLeft(node, node.Icon.Position, size, size),
          size,
          size,
        );
      placed.push(box);
      total += scoreNodeLabelOverlaps(
        nodeOverlapCount(box, g.Nodes, 0, guard),
        edgeOverlapCount(box, g.Edges, 0, guard),
        boxOverlapCount(box, placed, 0, guard) - 1,
      );
    }
    if (!node.Label) continue;
    const box = new Box(
        LabelTopLeft(
          node,
          node.Label.Position,
          node.Label.Width,
          node.Label.Height,
        ),
        node.Label.Width,
        node.Label.Height,
      ),
      siblings: Node[] = [];
    for (const sibling of g.Containers.get(node.Container) ?? []) {
      guard.Step();
      if (sibling !== node) siblings.push(sibling);
    }
    if (node.IsContainer())
      for (const child of g.Containers.get(node) ?? []) {
        guard.Step();
        siblings.push(child);
      }
    const ancestors: Node[] = [];
    for (
      let current: Node | null = node, depth = 0;
      current;
      current = current.container(), depth++
    ) {
      guard.Step();
      if (depth >= MaxEngineTreeDepth)
        throw new Error(
          `TALA Evaluate container depth exceeds limit ${MaxEngineTreeDepth}`,
        );
      ancestors.push(current);
    }
    const siblingCount = nodeOverlapCount(box, siblings, PADDING, guard),
      ancestorCount = partialNodeOverlapCount(box, ancestors, PADDING, guard),
      edgeCount = edgeOverlapCount(box, g.Edges, PADDING - 1, guard),
      labelCount = boxOverlapCount(box, placed, PADDING, guard);
    total += scoreNodeLabelOverlaps(
      siblingCount + ancestorCount,
      edgeCount,
      labelCount,
    );
    placed.push(box);
  }
  const segments = findSharedSegments(g.Edges, guard),
    sharedBoxes: Box[] = [];
  for (const s of segments) {
    guard.Step();
    const topLeft = s.Start.Copy();
    let width = s.End.X - s.Start.X,
      height = s.End.Y - s.Start.Y;
    if (s.End.X === s.Start.X) {
      width = 25;
      topLeft.X -= 12.5;
    } else {
      height = 25;
      topLeft.Y -= 12.5;
    }
    sharedBoxes.push(new Box(topLeft, width, height));
  }
  for (const edge of g.Edges) {
    guard.Step();
    if (!edge.Label || edge.IsLoop()) continue;
    guard.Add(BigInt(edge.Points.length));
    const box = labelBox(edge),
      otherEdges: Edge[] = [];
    for (const other of g.Edges) {
      guard.Step();
      if (other !== edge) otherEdges.push(other);
    }
    const ancestors: Node[] = [],
      nonAncestors: Node[] = [];
    for (const node of g.Nodes) {
      guard.Step();
      const from = evaluationIsDescendantOf(edge.From, node, guard),
        to = evaluationIsDescendantOf(edge.To, node, guard);
      (node !== edge.From && node !== edge.To && (from || to)
        ? ancestors
        : nonAncestors
      ).push(node);
    }
    const area =
      nodeOverlapArea(box, ancestors, PADDING, true, guard) +
      nodeOverlapArea(box, nonAncestors, PADDING, false, guard);
    const edges = edgeOverlapCount(box, otherEdges, PADDING, guard),
      labels = boxOverlapCount(box, placed, 0, guard),
      almost = boxOverlapCount(box, placed, PADDING, guard),
      shared = boxOverlapCount(box, sharedBoxes, PADDING, guard);
    total += scoreEdgeLabelOverlaps(
      box.Width * box.Height,
      area,
      0,
      edges,
      almost,
      labels,
      shared,
    );
    placed.push(box);
  }
  return 1 / (1 + total);
}
function chargeEvaluationAreaWork(g: Graph, guard: WorkGuard): void {
  guard.Add(BigInt(g.Nodes.length));
  for (const node of g.Nodes)
    if (node.Label && IsOutside(node.Label.Position))
      for (let i = 0; i < 4; i++) guard.Add(BigInt(g.Nodes.length));
  for (const edge of g.Edges) {
    let multiplier = 1;
    if (
      edge.Label &&
      edge.Points.length !== 0 &&
      edge.Label.Position !== Position.Unset
    )
      multiplier++;
    if (edge.SourceArrowheadLabel) multiplier++;
    if (edge.TargetArrowheadLabel) multiplier++;
    for (let i = 0; i < multiplier; i++) guard.Add(BigInt(edge.Points.length));
  }
}
export function evaluateWithAreaLimit(
  ctx: Context,
  g: Graph,
  workLimit: bigint,
): [number, number, bigint] {
  if (!g) throw new Error('cannot evaluate a nil graph');
  ValidatePositionedGraphSelection(ctx, 'Evaluate', g, []);
  const guard = new WorkGuard(ctx, 'Evaluate', workLimit);
  let score = 0;
  for (const edge of g.Edges) {
    guard.Step();
    if (edge.From.Cluster || edge.To.Cluster) continue;
    score += Math.max(0, edge.Points.length - 2) * 0.5;
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      const a = edge.Points[i]!,
        b = edge.Points[i + 1]!;
      if (a.X !== b.X && a.Y !== b.Y) score += 3;
    }
  }
  score += countNonSharedCrossings(g.Edges, guard);
  score += 1 - scoreExistingLabelPlacements(g, guard);
  chargeEvaluationAreaWork(g, guard);
  const [tl, br] = graphBoundingBox(g, false),
    area = tl && br ? Math.abs(tl.X - br.X) * Math.abs(tl.Y - br.Y) : 0;
  guard.Finish();
  return [score, area, guard.Used()];
}
export function EvaluateWithArea(ctx: Context, g: Graph): [number, number] {
  const [score, area] = evaluateWithAreaLimit(ctx, g, maxEvaluationWorkUnits);
  return [score, area];
}
export class Score {
  constructor(
    public Penalty: number,
    public Area: number,
  ) {}
  Compare(other: Score): number {
    const compare = (a: number, b: number, nonnegative: boolean) => {
      const av = Number.isFinite(a) && (!nonnegative || a >= 0),
        bv = Number.isFinite(b) && (!nonnegative || b >= 0);
      if (av && !bv) return -1;
      if (!av && bv) return 1;
      if (!av) return 0;
      return a < b ? -1 : a > b ? 1 : 0;
    };
    return (
      compare(this.Penalty, other.Penalty, false) ||
      compare(this.Area, other.Area, true)
    );
  }
}
export function Evaluate(ctx: Context, g: Graph): Score {
  const [penalty, area] = EvaluateWithArea(ctx, g);
  return new Score(penalty, area);
}
