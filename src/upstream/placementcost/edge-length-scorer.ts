// Translated internal/placementcost/edge_length_scorer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { checkScoringCancellation } from './geometry.js';
import {
  prepareNodeEdgeLength,
  type EdgeLengthOptions,
  type EdgeLengthPreparation,
} from './edge-preparation.js';
import { evaluateNodeEdgeLength } from './edge-length.js';

export class NodeEdgeLengthScorer {
  private scratch: EdgeLengthPreparation | null = null;
  private prepChecks = 0;
  constructor(
    private node: Node | null,
    private options: EdgeLengthOptions | null,
  ) {}
  Score(ctx: Context): number {
    checkScoringCancellation(ctx);
    if (this.node === null) throw new Error('EdgeLength: scorer is closed');
    if (this.scratch === null) {
      let count = 0;
      const checks: Context = {
        Done: () => ctx.Done(),
        Err: () => {
          count++;
          return ctx.Err();
        },
      };
      if (ctx.Value !== undefined) checks.Value = (key) => ctx.Value!(key);
      this.scratch = prepareNodeEdgeLength(checks, this.node, this.options!);
      this.prepChecks = count;
    } else {
      for (let i = 0; i < this.prepChecks; i++) checkScoringCancellation(ctx);
    }
    return evaluateNodeEdgeLength(ctx, this.node, this.options!, this.scratch);
  }
  Close(): void {
    this.scratch = null;
    this.node = null;
    this.options = null;
    this.prepChecks = 0;
  }
}
export function NewNodeEdgeLengthScorer(
  node: Node,
  options: EdgeLengthOptions,
): NodeEdgeLengthScorer {
  return new NodeEdgeLengthScorer(node, options);
}
