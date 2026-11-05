// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { scoringCancellationError } from './geometry.js';
import { scoringNodeBounds } from './obstruction-bounds.js';
import { obstructionSets } from './obstruction-sets.js';
import { ObstructionRoute } from './obstruction-route.js';
import type { EdgeRouteGeometry } from './edge-route-geometry.js';

export function addObstructionCost(
  ctx: Context,
  node: Node,
  replacement: Node,
  adjacent: Node,
  route: EdgeRouteGeometry,
  distance: number,
): number {
  const bounds = scoringNodeBounds(replacement).including(
    scoringNodeBounds(adjacent),
  );
  const checker = new ObstructionRoute(replacement, adjacent, route);
  let bestBlocked = false,
    alternateBlocked = !route.isSemiDiagonal;
  const sets = obstructionSets(node.Graph!, replacement, adjacent);
  for (let j = 0; j < sets.length; j++) {
    scoringCancellationError(ctx, j);
    const obstructions = sets[j]!;
    for (let i = 0; i < obstructions.length; i++) {
      scoringCancellationError(ctx, i);
      const obstruction = obstructions[i]!;
      if (bounds.excludes(obstruction)) continue;
      if (
        isDescendantOf(replacement, obstruction) ||
        isDescendantOf(adjacent, obstruction)
      )
        continue;
      if (
        obstruction.TopLeft === null ||
        obstruction.Graph !== replacement.Graph
      )
        continue;
      if (obstruction === replacement || obstruction === adjacent) continue;
      if (
        obstruction.isClusterVessel &&
        (replacement.Cluster?.Vessel === obstruction ||
          adjacent.Cluster?.Vessel === obstruction)
      )
        continue;
      if (!bestBlocked && checker.bestBlocked(obstruction)) bestBlocked = true;
      if (
        bestBlocked &&
        !alternateBlocked &&
        checker.alternateBlocked(obstruction)
      )
        alternateBlocked = true;
      if (bestBlocked && alternateBlocked) break;
    }
    if (bestBlocked && alternateBlocked) break;
  }
  if (bestBlocked) {
    let cost: number;
    if (replacement.Cluster !== null || adjacent.Cluster !== null)
      cost = TurnCost(node.Graph!) * 2;
    else if (route.isDiagonal) cost = TurnCost(node.Graph!);
    else if (route.isSemiDiagonal)
      cost = alternateBlocked
        ? TurnCost(node.Graph!) * 2
        : TurnCost(node.Graph!);
    else cost = TurnCost(node.Graph!) * 2;
    distance += cost;
  }
  return distance;
}
