// Translated internal/placement/initialize.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { allReachableNodesGuarded } from '../layoutgraph/reachability.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { NodeEdgeLength } from '../placementcost/edge-length.js';
import { compactionFactor } from './tuning.js';
import { snapshotNodePositionsContext, restoreNodePositions } from './types.js';
import { occupied } from './metrics.js';
import { SizelessCandidates } from './sizeless-candidates.js';
import { nodeCandidatePositions } from './initialize-candidates.js';

export function initializeNodes(ctx: Context, graph: Graph): void {
  validateEngineGraph(ctx, 'InitializeNodes', graph);
  if (graph.Nodes.length === 0) return;
  const positions = snapshotNodePositionsContext(
    ctx,
    'InitializeNodes',
    graph.Nodes,
  );
  let complete = false;
  try {
    const guard = new WorkGuard(
      ctx,
      'InitializeNodesReachability',
      MaxEngineWorkUnits,
    );
    const sizelessFactor = graph.CellSize * compactionFactor;
    const init = (node: Node): void => {
      const err = ctx.Err();
      if (err !== null)
        throw new Error(`InitializeNodes: ${err.message}`, { cause: err });
      if (node.TopLeft !== null) return;
      let least = Infinity,
        leastPoint: Point | null = node.TopLeft;
      const optimizer = new SizelessCandidates(ctx, graph, null);
      const candidates = nodeCandidatePositions(ctx, node, graph, optimizer);
      for (const p of candidates) {
        const [, isOccupied] = occupied(graph, p);
        if (isOccupied) continue;
        node.TopLeft = p;
        let edgeLength: number;
        try {
          edgeLength = NodeEdgeLength(ctx, node, {
            EdgeAbductions: null,
            IncludeNodeSizes: false,
            EnforceMinimumGap: false,
            PenalizeDirection: true,
          });
        } catch (error) {
          node.TopLeft = null;
          throw error;
        }
        if (edgeLength < least) {
          least = edgeLength;
          leastPoint = p;
        }
        node.TopLeft = null;
      }
      node.TopLeft = leastPoint;
    };
    const fixed = graph.Nodes.filter((n) => n.FixedTopLeft !== null);
    if (fixed.length > 0) {
      const nodes: Node[] = [];
      for (const fn of fixed) {
        const reachable = allReachableNodesGuarded(
          fn,
          false,
          true,
          true,
          null,
          guard,
        );
        nodes.push(...reachable);
        for (const n of reachable) n.TopLeft = null;
      }
      for (const fn of fixed)
        fn.TopLeft = new Point(
          Math.ceil(fn.FixedTopLeft!.X / sizelessFactor),
          Math.ceil(fn.FixedTopLeft!.Y / sizelessFactor),
        );
      for (const n of nodes) init(n);
    } else {
      const order = allReachableNodesGuarded(
        graph.Nodes[0]!,
        false,
        true,
        true,
        null,
        guard,
      );
      for (let i = 1; i < order.length; i++) order[i]!.TopLeft = null;
      graph.Nodes[0]!.TopLeft = new Point(
        graph.Nodes.length,
        graph.Nodes.length,
      );
      for (let i = 1; i < order.length; i++) init(order[i]!);
    }
    for (const node of graph.Nodes)
      if (node.TopLeft === null)
        throw new Error(`missed initializing node ${nodeDebugID(node)}`);
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) restoreNodePositions(positions);
  }
}
