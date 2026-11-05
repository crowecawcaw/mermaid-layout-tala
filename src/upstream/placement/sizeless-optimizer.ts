// Translated internal/placement/sizeless_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import { MaxEngineNodes } from '../limits/work.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
  Shuffle,
  type Random,
} from '../limits/optimization.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { optimizerSwapPositions } from './optimizer-movement.js';
import {
  OptimizerMutationSnapshot,
  captureOptimizerMutationStateInto,
} from './optimizer-snapshot.js';
import { SizelessCandidates } from './sizeless-candidates.js';
import {
  moveNodeToBestGuarded,
  bestSwapCandidateGuarded,
} from './sizeless-moves.js';
export type OptimizerRandom = Random & { float64(): number };
export class SizelessOptimizer extends SizelessCandidates {
  private readonly mutationScratch = new OptimizerMutationSnapshot();
  constructor(
    ctx: Context,
    graph: Graph,
    readonly generator: OptimizerRandom | null,
  ) {
    super(ctx, graph, generator);
  }
  optimize(ctx: Context, temp: number): void {
    this.optimizeWithLimit(ctx, temp, MaxOptimizationWorkUnits);
  }
  optimizeWithLimit(ctx: Context, temp: number, workLimit: bigint): void {
    const guard = new OptimizationWorkGuard(
      ctx,
      'sizelessOptimizer.optimize',
      workLimit,
    );
    if (this.graph == null)
      throw new Error(
        'TALA sizelessOptimizer.optimize requires an optimizer with a graph',
      );
    if (this.generator === null)
      throw new Error(
        'TALA sizelessOptimizer.optimize requires a random generator',
      );
    try {
      const snapshot = captureOptimizerMutationStateInto(
          this.graph,
          guard,
          this.mutationScratch,
        ),
        occupied = this.snapshotOccupied();
      for (const ignored of occupied) {
        void ignored;
        guard.Step();
      }
      let complete = false;
      try {
        this.optimizeGuarded(ctx, temp, guard);
        guard.Finish();
        complete = true;
      } finally {
        if (!complete) {
          snapshot.restore();
          this.restoreOccupied(occupied);
        }
      }
    } finally {
      this.mutationScratch.release();
    }
  }
  optimizeGuarded(
    ctx: Context,
    temp: number,
    guard: OptimizationWorkGuard,
  ): void {
    if (this.nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA sizelessOptimizer.optimize node count exceeds limit ${MaxEngineNodes}`,
      );
    const indices: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      guard.Step();
      indices.push(i);
    }
    Shuffle(indices, this.generator!, guard);
    for (const index of indices) {
      guard.Step();
      const node = this.nodes[index];
      if (node == null || node.TopLeft === null)
        throw new Error(
          'TALA sizelessOptimizer.optimize found an unpositioned node',
        );
      this.removeOccupied(node.TopLeft);
      const median = this.medianPointGuarded(node, temp, guard);
      let distance: number;
      try {
        distance = this.findClosestUnoccupiedDistanceGuarded(
          node,
          median,
          guard,
        );
      } catch (error) {
        throw new Error(
          `could not find an unoccupied distance for ${nodeDebugID(node)}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      const points = this.placementPointsGuarded(node, median, distance, guard);
      Shuffle(points, this.generator!, guard);
      const moved = moveNodeToBestGuarded(ctx, node, points, guard);
      if (!moved) {
        const candidate = bestSwapCandidateGuarded(
          ctx,
          this,
          node,
          this.generator!,
          guard,
        );
        if (candidate !== null) {
          optimizerSwapPositions(node, candidate, guard);
          this.putOccupied(candidate.TopLeft!, candidate);
        }
      }
      this.putOccupied(node.TopLeft!, node);
    }
    guard.Finish();
  }
}
