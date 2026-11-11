// Translated from internal/engine/pipeline.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { GoRandom } from '../../random.js';
import type { Context } from '../limits/context.js';
import { MaxGraphSize } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Clone } from '../layoutgraph/clone.js';
import { BoundingBox } from '../layoutgraph/graph-bounds.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import { ResetPlacementCosts } from '../layoutgraph/placement-cost.js';
import { New as invariant } from '../invariant/errors.js';
import { IsUnlocked, Position } from '../label/label.js';
import {
  Prescale,
  Prepare,
  Pad,
  Normalize,
} from '../placement/basic-stages.js';
import { Place as PlaceNodes } from '../placement/place.js';
import { Swap } from '../placement/swap-stage.js';
import { TransposeAll, BalanceSymmetry } from '../placement/symmetry-stage.js';
import { Align } from '../placement/alignment-stage.js';
import { NormalizeGaps } from '../placement/gap-reduction.js';
import { OptimizeClusters } from '../placement/cluster-flip.js';
import { Equidistance } from '../placement/equidistance.js';
import { Dejitter } from '../placement/dejitter.js';
import { AddSequences } from '../grouping/sequences.js';
import { AddClusters } from '../grouping/clusters.js';
import { ResetClusters, Cleanup } from '../grouping/lifecycle.js';
import { Preprocess as PreprocessTrees } from '../trees/preprocess.js';
import { Assign } from '../hierarchy/assign.js';
import { Candidates } from '../hierarchy/eligibility.js';
import { Place as PlaceHierarchies } from '../hierarchy/place.js';
import { RemoveIsolatedMemberships } from '../hierarchy/build.js';
import { AddHubs } from '../proximity/hubs.js';
import { Pack } from '../packing/binpack.js';
import { RouteGraph } from '../routing/graph-stage.js';
import { Crosshatch } from '../routing/crosshatch.js';
import { SimplifyEdgeRoutes } from '../routing/edge-simplify.js';
import { SwapAllEdgePorts } from '../routing/swap-ports.js';
import { StraightEdgesFallback } from '../routing/straight-fallback.js';
import { BalanceEdgeSegments } from '../routing/balance-segments.js';
import { FixClusterEdgeBranching } from '../routing/cluster-branching.js';
import { TraceEdgesToShapeBorder } from '../routing/trace.js';
import { ReorderDuplicates } from '../routing/reorder-duplicates.js';
import { Place as PlaceLabels } from '../labeling/place.js';
import { NudgeEdgeChannels } from '../routing/nudge-channels.js';
import { ShortcutEdgeRoutes } from '../routing/shortcut-routes.js';
export interface LayoutOptions {
  Seed: bigint;
}
export interface PipelineStage {
  name: string;
  run: (pipeline: Pipeline, ctx: Context) => void;
}
export const defaultPipelineStages: readonly PipelineStage[] = [
  { name: 'Prescale', run: (p) => Prescale(p.graph) },
  {
    name: 'PreprocessSequences',
    run: (p, c) => AddSequences(c, p.graph, p.random),
  },
  { name: 'Preprocess', run: (p) => Prepare(p.graph) },
  { name: 'PreprocessTrees', run: (p, c) => PreprocessTrees(c, p.graph) },
  {
    name: 'PreprocessHierarchies',
    run: (p, c) => {
      Assign(c, p.graph, null, Candidates(p.graph));
      PlaceHierarchies(c, p.graph, null, p.hierarchyRandom);
      RemoveIsolatedMemberships(p.graph);
    },
  },
  {
    name: 'PreprocessClusters',
    run: (p, c) => AddClusters(c, p.graph, p.seed, p.random),
  },
  { name: 'PreprocessHubs', run: (p, c) => AddHubs(c, p.graph) },
  { name: 'NodePlacement', run: (p, c) => PlaceNodes(c, p.graph, p.seed) },
  { name: 'SwapStuff', run: (p, c) => Swap(c, p.graph) },
  { name: 'Transpose', run: (p, c) => TransposeAll(c, p.graph) },
  { name: 'AlignAxes', run: (p, c) => p.alignAxes(c) },
  {
    name: 'GapNormalization',
    run: (p, c) => {
      p.alignAxesNeeded = NormalizeGaps(c, p.graph);
    },
  },
  { name: 'AlignAxes', run: (p, c) => p.alignAxes(c) },
  {
    name: 'OptimizeClusters',
    run: (p, c) => {
      p.graph.ComputeCellSize();
      p.alignAxesNeeded = OptimizeClusters(c, p.graph);
    },
  },
  { name: 'AlignAxes', run: (p, c) => p.alignAxes(c) },
  { name: 'BalanceSymmetry', run: (p, c) => BalanceSymmetry(c, p.graph) },
  {
    name: 'Equidistance',
    run: (p, c) => {
      p.graph.ComputeCellSize();
      p.alignAxesNeeded = Equidistance(c, p.graph);
    },
  },
  { name: 'AlignAxes', run: (p, c) => p.alignAxes(c) },
  { name: 'BinPack', run: (p, c) => Pack(c, p.graph, null) },
  { name: 'CleanupStuff', run: (p) => Cleanup(p.graph) },
  {
    name: 'Rescale',
    run: (p) => {
      p.graph.ComputeCellSize();
      Pad(p.graph);
    },
  },
  { name: 'EdgeRouting', run: (p, c) => p.route(c) },
  { name: 'Crosshatch', run: (p, c) => Crosshatch(c, p.graph) },
  {
    name: 'Dejitter',
    run: (p, c) => {
      p.forceReroute = Dejitter(c, p.graph);
    },
  },
  { name: 'EdgeRouting', run: (p, c) => p.route(c) },
  { name: 'SimplifyEdgeRoutes', run: (p, c) => SimplifyEdgeRoutes(c, p.graph) },
  { name: 'SwapEdgePorts', run: (p, c) => SwapAllEdgePorts(c, p.graph) },
  {
    name: 'StraightEdgesFallback',
    run: (p, c) => StraightEdgesFallback(c, p.graph),
  },
  {
    name: 'BalanceEdgeSegments',
    run: (p, c) => BalanceEdgeSegments(c, p.graph),
  },
  {
    name: 'FixClusterEdgeBranching',
    run: (p, c) => FixClusterEdgeBranching(c, p.graph),
  },
  {
    name: 'TraceEdgesToShapeBorder',
    run: (p, c) => TraceEdgesToShapeBorder(c, p.graph),
  },
  { name: 'ReorderDuplicates', run: (p, c) => ReorderDuplicates(c, p.graph) },
  { name: 'BinPack', run: (p, c) => Pack(c, p.graph, null) },
  { name: 'PlaceLabels', run: (p, c) => PlaceLabels(c, p.graph) },
  { name: 'NudgeEdgeChannels', run: (p, c) => NudgeEdgeChannels(c, p.graph) },
  { name: 'ShortcutEdgeRoutes', run: (p, c) => ShortcutEdgeRoutes(c, p.graph) },
  { name: 'Normalize', run: (p) => Normalize(p.graph) },
];
export class Pipeline {
  readonly random: GoRandom;
  readonly hierarchyRandom: GoRandom;
  forceReroute = false;
  edgeRoutingComplete = false;
  alignAxesNeeded = true;
  constructor(
    readonly graph: Graph,
    readonly seed: bigint,
    public stages: readonly PipelineStage[] = defaultPipelineStages,
  ) {
    this.random = new GoRandom(seed);
    this.hierarchyRandom = new GoRandom(seed);
  }
  alignAxes(ctx: Context): void {
    if (!this.alignAxesNeeded) return;
    this.alignAxesNeeded = false;
    Align(ctx, this.graph);
  }
  route(ctx: Context): void {
    this.edgeRoutingComplete = RouteGraph(ctx, this.graph, {
      ForceReroute: this.forceReroute,
      RoutesPreviouslyCompleted: this.edgeRoutingComplete,
    });
  }
  resetFullLayoutRouteState(): void {
    for (const edge of this.graph.Edges) {
      if (!edge) continue;
      edge.Points = [];
      if (!edge.Label || !edge.Label.PositionFixed()) {
        edge.LabelPercentage = 0;
        if (edge.Label && IsUnlocked(edge.Label.Position))
          edge.Label.Position = Position.Unset;
      }
      edge.IsCurve = false;
    }
    ResetPlacementCosts(this.graph);
  }
  runAllStages(ctx: Context): void {
    [ctx] = EnsureTransactionWorkGuard(ctx, 'AutolayoutTransactions');
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i]!,
        before = ctx.Err();
      if (before)
        throw new Error(`${stage.name}: ${before.message}`, { cause: before });
      if (i === 0) {
        ResetClusters(this.graph);
        this.resetFullLayoutRouteState();
      }
      stage.run(this, ctx);
      const after = ctx.Err();
      if (after)
        throw new Error(`${stage.name}: ${after.message}`, { cause: after });
      const [tl, br] = BoundingBox(this.graph);
      if (tl && br) {
        const width = br.X - tl.X,
          height = br.Y - tl.Y;
        if (width > MaxGraphSize || height > MaxGraphSize)
          throw invariant(
            `Dimensions w:${width}, h:${height} reached after stage ${stage.name}`,
          );
      }
    }
  }
}
export function Layout(
  ctx: Context,
  graph: Graph,
  options: LayoutOptions,
): Graph {
  if (!ctx) throw new Error('TALA Autolayout requires a context');
  const initial = ctx.Err();
  if (initial)
    throw new Error(`Autolayout: ${initial.message}`, { cause: initial });
  if (!graph) throw new Error('TALA Autolayout requires a graph');
  let workspace: Graph;
  try {
    workspace = Clone(ctx, graph);
  } catch (error) {
    const canceled = ctx.Err();
    if (canceled) throw new Error(`Autolayout: ${canceled.message}`, { cause: canceled });
    throw error;
  }
  // Go's runLayout checks the context again before it handles an empty graph.
  const beforeRun = ctx.Err();
  if (beforeRun) throw new Error(`Autolayout: ${beforeRun.message}`, { cause: beforeRun });
  if (workspace.Nodes.length) {
    const workCtx: Context =
      ctx.Done() === null
        ? {
            Done: () => ({ closed: false }),
            Err: () => ctx.Err(),
            Value: (key) => ctx.Value?.(key),
          }
        : ctx;
    new Pipeline(workspace, options.Seed).runAllStages(workCtx);
  }
  const error = ctx.Err();
  if (error) throw new Error(`Autolayout: ${error.message}`, { cause: error });
  return workspace;
}
