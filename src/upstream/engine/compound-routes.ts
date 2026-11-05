// Translated from internal/engine/compound_routes.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { Point } from '../geo/point.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import {
  Clone,
  copyLabelRecord,
  copyIconRecord,
} from '../layoutgraph/clone.js';
import { ResetPlacementCosts } from '../layoutgraph/placement-cost.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { Position } from '../label/label.js';
import { ArrowheadTopLeft } from '../labelgeom/arrowhead.js';
import { Place as PlaceLabels } from '../labeling/place.js';
import { Normalize } from '../placement/basic-stages.js';
export function compoundRoot(node: Node): Node {
  while (node.Container) node = node.Container;
  return node;
}
export function compoundEnclosedRoute(edge: Edge, guard: WorkGuard): boolean {
  const root = compoundRoot(edge.From);
  if (
    !root.IsContainer() ||
    root !== compoundRoot(edge.To) ||
    edge.Points.length < 2
  )
    return false;
  const inside = (p: Point | null, width: number, height: number) =>
    !!p &&
    !Number.isNaN(p.X) &&
    !Number.isNaN(p.Y) &&
    p.X >= root.TopLeft!.X &&
    p.Y >= root.TopLeft!.Y &&
    p.X + width <= root.TopLeft!.X + root.Width &&
    p.Y + height <= root.TopLeft!.Y + root.Height;
  for (const point of edge.Points) {
    guard.Step();
    if (!inside(point, 0, 0)) return false;
  }
  const attached = (node: Node, p: Point) =>
    node.Box.Contains(p) &&
    (p.X === node.TopLeft!.X ||
      p.X === node.TopLeft!.X + node.Width ||
      p.Y === node.TopLeft!.Y ||
      p.Y === node.TopLeft!.Y + node.Height);
  if (
    !attached(edge.From, edge.Points[0]!) ||
    !attached(edge.To, edge.Points.at(-1)!)
  )
    return false;
  if (edge.Label) {
    if (edge.Label.Position === Position.Unset) return false;
    guard.Add(BigInt(edge.Points.length));
    if (
      !inside(
        EdgeLabelTopLeft(
          edge,
          edge.Label.Position,
          edge.Label.Width,
          edge.Label.Height,
        ),
        edge.Label.Width,
        edge.Label.Height,
      )
    )
      return false;
  }
  for (const [i, label] of [
    edge.SourceArrowheadLabel,
    edge.TargetArrowheadLabel,
  ].entries()) {
    if (!label) continue;
    guard.Add(BigInt(edge.Points.length));
    if (
      !inside(
        ArrowheadTopLeft(
          edge.Points,
          i === 1,
          edge.SourceArrowhead,
          edge.TargetArrowhead,
          label.Width,
          label.Height,
        ),
        label.Width,
        label.Height,
      )
    )
      return false;
  }
  return true;
}
export function preserveCompoundInteriors(
  ctx: Context,
  before: Graph,
  after: Graph,
): void {
  const guard = new WorkGuard(ctx, 'CompoundRoutes', MaxEngineWorkUnits);
  for (let i = 0; i < after.Nodes.length; i++) {
    const node = after.Nodes[i]!,
      original = before.Nodes[i]!;
    if (original.Label?.PositionFixed()) {
      node.Label = copyLabelRecord(original.Label);
      node.Label!.FixPosition();
    }
    if (original.Icon?.PositionFixed()) {
      node.Icon = copyIconRecord(original.Icon);
      node.Icon!.FixPosition();
    }
  }
  for (let i = 0; i < after.Edges.length; i++) {
    const error = ctx.Err();
    if (error) throw error;
    const edge = after.Edges[i]!,
      original = before.Edges[i]!;
    if (original.Label?.PositionFixed()) {
      edge.Label = copyLabelRecord(original.Label);
      edge.Label!.FixPosition();
      edge.LabelPercentage = original.LabelPercentage;
    }
    if (compoundEnclosedRoute(original, guard)) {
      const oldRoot = compoundRoot(original.From),
        newRoot = compoundRoot(edge.From),
        dx = newRoot.TopLeft!.X - oldRoot.TopLeft!.X,
        dy = newRoot.TopLeft!.Y - oldRoot.TopLeft!.Y;
      edge.Points = original.Points.map((point) => {
        guard.Step();
        return new Point(point.X + dx, point.Y + dy);
      });
      edge.IsCurve = original.IsCurve;
      edge.LabelPercentage = original.LabelPercentage;
      if (original.Label) {
        edge.Label = copyLabelRecord(original.Label);
        if (original.Label.PositionFixed()) edge.Label!.FixPosition();
      }
    }
  }
  ResetPlacementCosts(after);
  PlaceLabels(ctx, after);
  Normalize(after);
  guard.Finish();
}
export function PreserveCompoundRoutes(
  ctx: Context,
  before: Graph,
  selected: Graph,
): Graph {
  const candidate = Clone(ctx, selected);
  for (let i = 0; i < candidate.Edges.length; i++)
    candidate.Edges[i]!.IsCurve = selected.Edges[i]!.IsCurve;
  preserveCompoundInteriors(ctx, before, candidate);
  return candidate;
}
