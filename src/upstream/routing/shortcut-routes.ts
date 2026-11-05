// Translated from internal/routing/shortcut_routes.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Box } from '../geo/box.js';
import { Inspect } from '../quality/inspection.js';
import {
  MaxRouteStageWorkUnits,
  runAtomicRouteStage,
  captureRouteMutations,
} from './stage-guard.js';
import { channelInventoryIsClosed } from './nudge-channels.js';
import {
  shortcutCandidate,
  shortcutBends,
  shortcutLength,
  shortcutOrthogonal,
  shortcutEpsilon,
} from './shortcut-geometry.js';
import {
  shortcutCandidateSafe,
  shortcutLabelBoxes,
} from './shortcut-safety.js';
const maxShortcutInput = 256,
  maxShortcutRoute = 32;
export function shortcutInputTooLarge(g: Graph | null): boolean {
  if (!g) return false;
  if (g.Nodes.length > maxShortcutInput || g.Edges.length > maxShortcutInput)
    return true;
  let remaining = maxShortcutInput;
  for (const e of g.Edges)
    if (e) {
      if (e.Points.length > remaining) return true;
      remaining -= e.Points.length;
    }
  return false;
}
export function shortcutRoutesWithLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  if (ctx && g) {
    const error = ctx.Err();
    if (error) throw error;
    if (shortcutInputTooLarge(g)) {
      const err = ctx.Err();
      if (err) throw err;
      return;
    }
  }
  runAtomicRouteStage(ctx, 'ShortcutEdgeRoutes', g, [], limit, (guard) => {
    let boxes: Box[] = [],
      labelsReady = false,
      inventoryChecked = false;
    for (const e of g.Edges) {
      guard.Step();
      if (
        e.IsInvisible ||
        e.IsCurve ||
        e.IsLoop() ||
        g.NodeToTree.has(e.From) ||
        g.NodeToTree.has(e.To) ||
        e.Label ||
        e.SourceArrowheadLabel ||
        e.TargetArrowheadLabel ||
        e.Points.length < 5 ||
        e.Points.length > maxShortcutRoute ||
        !shortcutOrthogonal(e.Points)
      )
        continue;
      let unsupported = false;
      for (const other of g.Edges) {
        guard.Step();
        unsupported ||= other.IsCurve || !shortcutOrthogonal(other.Points);
      }
      if (unsupported) return;
      if (!labelsReady) {
        boxes = shortcutLabelBoxes(g, guard);
        labelsReady = true;
      }
      let best = e.Points,
        bestLength = shortcutLength(best);
      const beforeBends = shortcutBends(best);
      let bestBends = beforeBends;
      for (let start = 0; start + 3 < e.Points.length; start++)
        for (let end = start + 3; end < e.Points.length; end++)
          for (const horizontal of [true, false]) {
            guard.Add(BigInt(e.Points.length));
            const candidate = shortcutCandidate(
                e.Points,
                start,
                end,
                horizontal,
              ),
              length = shortcutLength(candidate),
              bends = shortcutBends(candidate);
            if (
              bends >= beforeBends ||
              bends > bestBends ||
              length > shortcutLength(e.Points) + shortcutEpsilon ||
              (bends === bestBends && length >= bestLength - shortcutEpsilon)
            )
              continue;
            if (shortcutCandidateSafe(g, e, candidate, boxes, guard)) {
              best = candidate;
              bestLength = length;
              bestBends = bends;
            }
          }
      if (bestBends === beforeBends) continue;
      if (!inventoryChecked) {
        const snapshot = captureRouteMutations(g, [], guard);
        if (!channelInventoryIsClosed(g, snapshot, guard)) return;
        inventoryChecked = true;
      }
      const before = Inspect(ctx, g),
        original = e.Points;
      e.Points = best;
      const after = Inspect(ctx, g);
      if (
        after.RouteObstructions > before.RouteObstructions ||
        after.Crossings > before.Crossings ||
        after.TextOcclusions > before.TextOcclusions ||
        after.RouteLength > before.RouteLength + shortcutEpsilon
      )
        e.Points = original;
    }
  });
}
export function ShortcutEdgeRoutes(ctx: Context, g: Graph): void {
  try {
    shortcutRoutesWithLimit(ctx, g, MaxRouteStageWorkUnits);
  } catch (error) {
    if (
      (error as Error).message.startsWith(
        'TALA route-stage work limit exceeded:',
      )
    )
      return;
    throw error;
  }
}
