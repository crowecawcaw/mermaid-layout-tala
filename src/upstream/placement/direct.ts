// Translated internal/placement/direct.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { NewTransaction } from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import { PrecisionCompare } from '../geo/math.js';
import { PRECISION } from '../geo/bezier.js';
import { EdgeLength } from '../placementcost/graph-edge-length.js';
import {
  containerEdgeDirections,
  hasFixedDescendant,
  transformsTo,
} from './direction.js';
import { mirrorAxes } from './mirror.js';
export interface DirectOptions {
  checkEdgeLength: boolean;
}
export function direct(
  ctx: Context,
  graph: Graph,
  nodes: Node[],
  container: Node | null,
  options: DirectOptions,
): void {
  const error = ctx.Err();
  if (error !== null) throw error;
  if (nodes.length === 0 || nodes[0]!.Hierarchy !== null) return;
  for (const node of nodes) {
    if (hasFixedDescendant(node)) return;
    const sequence = graph.Sequences.get(node);
    if (sequence !== undefined && sequence.EdgeAbductions.length > 0) return;
    if (node.Sequence !== null && node.Sequence.EdgeAbductions.length > 0)
      return;
  }
  const transforms = transformsTo(
    containerEdgeDirections(graph, container),
    graph.Direction(container),
  );
  if (!transforms.mirrorX && !transforms.mirrorY) return;
  if (!options.checkEdgeLength) {
    mirrorAxes(ctx, graph, transforms.mirrorX, transforms.mirrorY);
    return;
  }
  const costOptions = {
    EdgeAbductions: null,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: true,
  };
  const currentLength = EdgeLength(ctx, graph, costOptions);
  const transaction = NewTransaction(ctx, graph, {
    AffectContainers: true,
    IgnoreContainerEscape: false,
    AffectEdgeRoutes: false,
  });
  transaction.AddOp(() =>
    mirrorAxes(ctx, graph, transforms.mirrorX, transforms.mirrorY),
  );
  try {
    transaction.Commit(ctx);
  } catch (err) {
    if (IsCandidateRejection(err)) return;
    throw err;
  }
  let newLength: number;
  try {
    newLength = EdgeLength(ctx, graph, costOptions);
  } catch (err) {
    transaction.Rollback();
    throw err;
  }
  if (PrecisionCompare(newLength, currentLength, PRECISION) > 0)
    transaction.Rollback();
}
