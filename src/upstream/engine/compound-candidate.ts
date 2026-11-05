// Translated from internal/engine/compound_candidate.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { GoRandom } from '../../random.js';
import type { Context } from '../limits/context.js';
import { MaxGraphSize } from '../limits/work.js';
import { IsHorizontal } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Clone } from '../layoutgraph/clone.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import { PlaceCompound } from '../hierarchy/compound.js';
import { Normalize } from '../placement/basic-stages.js';
import { Pipeline } from './pipeline.js';
import { SimplifyEdgeRoutes } from '../routing/edge-simplify.js';
import { SwapAllEdgePorts } from '../routing/swap-ports.js';
import { StraightEdgesFallback } from '../routing/straight-fallback.js';
import { BalanceEdgeSegments } from '../routing/balance-segments.js';
import { FixClusterEdgeBranching } from '../routing/cluster-branching.js';
import { TraceEdgesToShapeBorder } from '../routing/trace.js';
import { ReorderDuplicates } from '../routing/reorder-duplicates.js';
import { Place as PlaceLabels } from '../labeling/place.js';
export function compoundCrossAxisDetours(g: Graph): number {
  const roots = new Map<Node, Node>();
  for (const node of g.Nodes) {
    let root = node;
    while (root.Container) root = root.Container;
    roots.set(node, root);
  }
  const horizontal = IsHorizontal(g.Direction(null));
  let detours = 0;
  for (const edge of g.Edges) {
    const from = roots.get(edge.From)!,
      to = roots.get(edge.To)!;
    if (from === to) continue;
    if (
      horizontal
        ? from.TopLeft!.Y + from.Height < to.TopLeft!.Y ||
          to.TopLeft!.Y + to.Height < from.TopLeft!.Y
        : from.TopLeft!.X + from.Width < to.TopLeft!.X ||
          to.TopLeft!.X + to.Width < from.TopLeft!.X
    )
      detours++;
  }
  return detours;
}
export function reroutePlaced(ctx: Context, g: Graph): void {
  const p = new Pipeline(g, 0n);
  p.resetFullLayoutRouteState();
  const stages = [
    () => p.route(ctx),
    () => SimplifyEdgeRoutes(ctx, g),
    () => SwapAllEdgePorts(ctx, g),
    () => StraightEdgesFallback(ctx, g),
    () => BalanceEdgeSegments(ctx, g),
    () => FixClusterEdgeBranching(ctx, g),
    () => TraceEdgesToShapeBorder(ctx, g),
    () => ReorderDuplicates(ctx, g),
    () => PlaceLabels(ctx, g),
  ];
  for (const stage of stages) {
    const error = ctx.Err();
    if (error) throw error;
    stage();
  }
  if (!g.Nodes.some((n) => n.FixedTopLeft !== null)) Normalize(g);
  const error = ctx.Err();
  if (error) throw error;
}
export function CompoundCandidate(ctx: Context, graph: Graph): Graph {
  if (!ctx || !graph)
    throw new Error('TALA compound candidate requires a context and graph');
  const error = ctx.Err();
  if (error) throw error;
  const roots = graph.Containers.get(null) ?? [];
  if (
    graph.Nodes.length > 128 ||
    graph.Edges.length > 256 ||
    roots.length < 3 ||
    roots.length > 64 ||
    !roots.some((n) => n.IsContainer()) ||
    graph.Nodes.some((n) => n.FixedTopLeft !== null)
  )
    return graph;
  const candidate = Clone(ctx, graph);
  if (!PlaceCompound(ctx, candidate, new GoRandom(0n))) return graph;
  const worse =
      compoundCrossAxisDetours(candidate) > compoundCrossAxisDetours(graph),
    canceled = ctx.Err();
  if (canceled) throw canceled;
  if (worse) return graph;
  reroutePlaced(ctx, candidate);
  const [tl, br] = BoundingBox(candidate);
  if (tl && br && (br.X - tl.X > MaxGraphSize || br.Y - tl.Y > MaxGraphSize))
    return graph;
  return candidate;
}
