// Translated internal/placementcost/symmetry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { overlapsAlongDimension } from '../layoutgraph/node-spatial.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from './geometry.js';
import { isMirrored, obstructed } from './symmetry-geometry.js';

export function computeSymmetryScoreInto(
  ctx: Context,
  node: Node,
  neighbors: Node[],
  matched: boolean[],
): number {
  checkScoringCancellation(ctx);
  const n = neighbors.length;
  if (n < 2) return 0;
  for (let i = 0; i < n; i++) matched[i] = false;
  let score = 0;
  const ownSiblings = node.Graph!.Containers.get(node.Container) ?? [];
  for (let i = 0; i < n; i++) {
    scoringCancellationError(ctx, i);
    if (matched[i]) continue;
    const n1 = neighbors[i]!;
    const otherSiblings =
      n1.Container !== node.Container
        ? (node.Graph!.Containers.get(n1.Container) ?? [])
        : [];
    let bestIdx = -1,
      best = 0;
    for (let j = i + 1; j < n; j++) {
      scoringCancellationError(ctx, j - i - 1);
      if (matched[j]) continue;
      const n2 = neighbors[j]!;
      if (n1.Container !== n2.Container) continue;
      const area1 = n1.Width * n1.Height,
        area2 = n2.Width * n2.Height;
      if (area1 > 2 * area2 || area2 > 2 * area1) continue;
      let ms = -Infinity;
      for (const isX of [true, false]) {
        let axis = node.TopLeft!.X + node.Width / 2;
        if (!isX) axis = node.TopLeft!.Y + node.Height / 2;
        if (isMirrored(n1, n2, isX, axis)) {
          ms =
            overlapsAlongDimension(node, n1, isX, true) &&
            overlapsAlongDimension(node, n2, isX, true)
              ? 2
              : 0.5;
          break;
        }
      }
      if (ms < 0) continue;
      if (obstructed(ctx, node, n1, n2, ownSiblings, otherSiblings)) continue;
      if (ms > best) {
        best = ms;
        bestIdx = j;
        if (ms === 2) break;
      }
    }
    if (bestIdx !== -1) {
      matched[i] = true;
      matched[bestIdx] = true;
      score += best;
    }
  }
  checkScoringCancellation(ctx);
  return score;
}
