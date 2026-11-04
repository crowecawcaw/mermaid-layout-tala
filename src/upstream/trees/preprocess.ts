// Translated from internal/trees/layout.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import {
  NewGraphStateSnapshot,
  RollbackGraphState,
} from '../layoutgraph/graph-state.js';
import { extractTrees, putBackNonBranchingTrees } from './discovery.js';
import { buildNodeToTreeGuarded } from './preprocess-helpers.js';
export const treePreprocessLocation = 'PreprocessTrees';
export function preprocessTreesWithWorkLimit(
  ctx: Context,
  g: Graph,
  workLimit: bigint,
): void {
  validateEngineGraph(ctx, treePreprocessLocation, g);
  const guard = new WorkGuard(ctx, treePreprocessLocation, MaxEngineWorkUnits);
  guard.SetLimit(workLimit);
  const state = NewGraphStateSnapshot({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    const trees = extractTrees(g, guard);
    g.Trees = trees;
    guard.Step();
    guard.Check();
    putBackNonBranchingTrees(g, guard);
    buildNodeToTreeGuarded(g, guard);
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
export function Preprocess(ctx: Context, g: Graph): void {
  preprocessTreesWithWorkLimit(ctx, g, MaxEngineWorkUnits);
}
