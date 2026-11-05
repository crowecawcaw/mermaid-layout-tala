// Translated from internal/hierarchy/rank.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../limits/optimization.js';
import { New as invariant } from '../invariant/errors.js';
import { newRankProblem, type RankProblem } from './rank-graph.js';
import { checked, solve } from './rank-simplex.js';
export interface RankResult {
  nodeToLevel: Map<Node, number>;
  levelCount: number;
}
export function makeRankResult(
  problem: RankProblem,
  levels: bigint[],
  guard: OptimizationWorkGuard,
): [RankResult, bigint] {
  let min = 9223372036854775807n,
    max = -9223372036854775808n;
  for (const level of levels) {
    guard.Step();
    if (level < min) min = level;
    if (level > max) max = level;
  }
  let primal = 0n;
  for (const edge of problem.edges) {
    guard.Step();
    const span = checked(
      levels[edge.to]! - levels[edge.from]!,
      'edge span overflow',
    );
    if (span < 1n) throw invariant(`infeasible span ${span}`);
    const weighted = checked(edge.weight * span, 'objective overflow');
    primal = checked(primal + weighted, 'objective overflow');
  }
  const range = checked(max - min, 'level count overflow');
  if (range > 9223372036854775806n) throw new Error('level count overflow');
  const result: RankResult = {
    nodeToLevel: new Map(),
    levelCount: Number(range + 1n),
  };
  for (let i = 0; i < levels.length; i++) {
    guard.Step();
    const normalized = checked(levels[i]! - min, 'normalized level overflow');
    result.nodeToLevel.set(problem.nodes[i]!, Number(normalized));
  }
  return [result, primal];
}
export function rankDAGWithLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): RankResult {
  const guard = new OptimizationWorkGuard(ctx, 'RankDAG', limit),
    problem = newRankProblem(g, guard);
  if (!problem.nodes.length) {
    guard.Finish();
    return { nodeToLevel: new Map(), levelCount: 0 };
  }
  const initial = problem.longestPathLevels(guard);
  if (!problem.edges.length) {
    guard.Finish();
    return { nodeToLevel: new Map([[problem.nodes[0]!, 0]]), levelCount: 1 };
  }
  const [levels, dual] = solve(problem, initial, guard),
    [result, primal] = makeRankResult(problem, levels, guard);
  if (primal !== dual)
    throw invariant(
      `optimality certificate failed: primal cost ${primal}, dual value ${dual}`,
    );
  guard.Finish();
  return result;
}
export function rankDAG(ctx: Context, g: Graph): RankResult {
  try {
    return rankDAGWithLimit(ctx, g, MaxOptimizationWorkUnits);
  } catch (error) {
    throw new Error(`TALA RankDAG failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
