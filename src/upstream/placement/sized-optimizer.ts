// Translated internal/placement/sized_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Box } from '../geo/box.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
  Shuffle,
} from '../limits/optimization.js';
import { MaxEngineNodes } from '../limits/work.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import { SyncHerdFences } from '../proximity/herding.js';
import { optimizerIsDescendantOf } from './optimizer-ancestry.js';
import { optimizerSwapPositions } from './optimizer-movement.js';
import { chargeOptimizerTranspose } from './optimizer-metrics.js';
import {
  OptimizerMutationSnapshot,
  captureOptimizerMutationStateInto,
} from './optimizer-snapshot.js';
import { SizedSearch, PlacementPointsScratch } from './sized-search.js';
import {
  moveSizedNodeToBestGuarded,
  bestSizedSwapCandidateGuarded,
} from './sized-moves.js';
import { withHubSpokesSuppressed } from './sized-kernels.js';
import { transpose } from './transpose.js';
import type { OptimizerRandom } from './sizeless-optimizer.js';

export class SizedOptimizer extends SizedSearch {
  private readonly mutationScratch = new OptimizerMutationSnapshot();
  private readonly placementScratch = new PlacementPointsScratch();
  private checkedPositions: Set<string> | null = null;
  constructor(
    ctx: Context,
    graph: Graph,
    root: Node | null,
    abductions: EdgeAbduction[] | null,
    readonly generator: OptimizerRandom | null,
    obstacles: Box[],
  ) {
    super(ctx, graph, root, abductions, generator, obstacles);
  }
  optimize(ctx: Context, temp: number): boolean {
    return this.optimizeWithLimit(ctx, temp, MaxOptimizationWorkUnits);
  }
  optimizeWithLimit(ctx: Context, temp: number, limit: bigint): boolean {
    [ctx] = EnsureTransactionWorkGuard(ctx, 'LocalOptimizeTransactions');
    const guard = new OptimizationWorkGuard(ctx, 'LocalOptimize', limit);
    if (this.graph == null)
      throw new Error('TALA LocalOptimize requires an optimizer with a graph');
    if (this.generator === null)
      throw new Error('TALA LocalOptimize requires a random generator');
    try {
      const snapshot = captureOptimizerMutationStateInto(
        this.graph,
        guard,
        this.mutationScratch,
      );
      let complete = false;
      try {
        const changed = this.optimizeGuarded(ctx, temp, guard);
        guard.Finish();
        complete = true;
        return changed;
      } finally {
        if (!complete) snapshot.restore();
      }
    } finally {
      this.mutationScratch.release();
    }
  }
  private syncHerdFencesGuarded(guard: OptimizationWorkGuard): void {
    const nodes = BigInt(this.graph.Nodes.length);
    guard.AddProduct(nodes, nodes + 1n);
    guard.Add(BigInt(this.graph.Edges.length));
    SyncHerdFences(this.graph);
    guard.Finish();
  }
  optimizeGuarded(
    ctx: Context,
    temp: number,
    guard: OptimizationWorkGuard,
  ): boolean {
    let changed = false;
    if (this.graph.Nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA LocalOptimize node count exceeds limit ${MaxEngineNodes}`,
      );
    const indices: number[] = [];
    for (let i = 0; i < this.graph.Nodes.length; i++) {
      guard.Step();
      indices.push(i);
    }
    Shuffle(indices, this.generator!, guard);
    for (const index of indices) {
      guard.Step();
      const node = this.graph.Nodes[index];
      if (node == null || node.TopLeft === null)
        throw new Error('TALA LocalOptimize found an unpositioned graph node');
      if (
        node.FixedTopLeft !== null ||
        node.Width > 100 * this.cellSize ||
        node.Height > 100 * this.cellSize
      )
        continue;
      if (node.Edges.length === 0) {
        let usable = false;
        for (const near of node.Nears) {
          guard.Step();
          if (optimizerIsDescendantOf(near, node.Container, guard)) {
            usable = true;
            break;
          }
        }
        if (!usable) continue;
      }
      if (this.graph.NodeToTree.has(node)) continue;
      const children = this.protrudingChildrenGuarded(node, guard),
        minimizingSelf = children.length === 0;
      let median = this.medianPointGuarded(node, temp, children, guard);
      this.spatialIndex.rebuild(this.graph, guard);
      let checked: Set<string> | null = null;
      if (indices.length > 10) {
        if (this.checkedPositions === null) this.checkedPositions = new Set();
        else this.checkedPositions.clear();
        checked = this.checkedPositions;
      }
      let distance = this.findClosestUnoccupiedDistanceGuarded(
        node,
        median,
        minimizingSelf,
        checked,
        guard,
      );
      let points = this.fillPlacementPointsGuarded(
        node,
        median,
        distance,
        minimizingSelf,
        this.placementScratch,
        guard,
      );
      Shuffle(points, this.generator!, guard);
      const moved = moveSizedNodeToBestGuarded(
        ctx,
        this,
        node,
        points,
        temp === 0,
        guard,
      );
      if (!moved) {
        const candidate = bestSizedSwapCandidateGuarded(
          ctx,
          this,
          node,
          this.generator!,
          guard,
        );
        if (candidate !== null) {
          changed = true;
          optimizerSwapPositions(node, candidate, guard);
          this.syncHerdFencesGuarded(guard);
        } else {
          chargeOptimizerTranspose(
            this.graph,
            node,
            this.edgeAbductions,
            guard,
          );
          const ok = transpose(ctx, this.graph, node, this.edgeAbductions);
          guard.Step();
          if (ok) changed = true;
          else {
            const spokes = this.graph.Hubs.get(node);
            if (spokes !== undefined && temp !== 0)
              withHubSpokesSuppressed(node, spokes, guard, () => {
                median = this.medianPointGuarded(node, temp, children, guard);
                distance = this.findClosestUnoccupiedDistanceGuarded(
                  node,
                  median,
                  minimizingSelf,
                  checked,
                  guard,
                );
                points = this.fillPlacementPointsGuarded(
                  node,
                  median,
                  distance,
                  minimizingSelf,
                  this.placementScratch,
                  guard,
                );
                Shuffle(points, this.generator!, guard);
                moveSizedNodeToBestGuarded(
                  ctx,
                  this,
                  node,
                  points,
                  temp === 0,
                  guard,
                );
              });
          }
        }
      } else {
        this.syncHerdFencesGuarded(guard);
        changed = true;
      }
    }
    guard.Finish();
    return changed;
  }
}
