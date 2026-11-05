// Translated from internal/placement/gapreduction.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { deltaToGuarded } from '../layoutgraph/node-spacing.js';

export function isBetween(
  node: Node,
  originalBehind: Node,
  originalAhead: Node,
  horizontal: boolean,
  forwards: boolean,
): boolean {
  let behind = originalBehind,
    ahead = originalAhead;
  const delta = deltaToGuarded(behind, node, behind.TopLeft, null);
  if (horizontal) {
    if (
      node.TopLeft!.Y + node.Height < behind.TopLeft!.Y - delta ||
      node.TopLeft!.Y > behind.TopLeft!.Y + behind.Height + delta
    )
      return false;
    if (!forwards) [behind, ahead] = [ahead, behind];
    if (
      node.TopLeft!.X + node.Width < behind.TopLeft!.X + behind.Width ||
      node.TopLeft!.X > ahead.TopLeft!.X
    )
      return false;
  } else {
    if (
      node.TopLeft!.X + node.Width < behind.TopLeft!.X - delta ||
      node.TopLeft!.X > behind.TopLeft!.X + behind.Width + delta
    )
      return false;
    if (!forwards) [behind, ahead] = [ahead, behind];
    if (
      node.TopLeft!.Y + node.Height < behind.TopLeft!.Y + behind.Height ||
      node.TopLeft!.Y > ahead.TopLeft!.Y
    )
      return false;
  }
  return true;
}

export function nearestBetween(
  nodes: Node[],
  behind: Node,
  ahead: Node,
  inContainer: Node | null,
  horizontal: boolean,
  forwards: boolean,
): Node | null {
  let nearest: Node | null = null;
  for (const n of nodes) {
    if (
      n === behind ||
      n === ahead ||
      n.container() !== inContainer ||
      !isBetween(n, behind, ahead, horizontal, forwards)
    )
      continue;
    if (!nearest) {
      nearest = n;
      continue;
    }
    if (
      horizontal
        ? forwards
          ? n.TopLeft!.X < nearest.TopLeft!.X
          : n.TopLeft!.X + n.Width > nearest.TopLeft!.X + nearest.Width
        : forwards
          ? n.TopLeft!.Y < nearest.TopLeft!.Y
          : n.TopLeft!.Y + n.Height > nearest.TopLeft!.Y + nearest.Height
    )
      nearest = n;
  }
  return nearest;
}

export function nearestConnectedAhead(
  node: Node,
  horizontal: boolean,
  forwards: boolean,
): Node | null {
  let nearest: Node | null = null;
  for (const edge of node.Edges) {
    const adj = node.Adjacent(edge);
    if (horizontal) {
      if (forwards) {
        if (adj.TopLeft!.X < node.TopLeft!.X + node.Width) continue;
        if (!nearest || adj.TopLeft!.X < nearest.TopLeft!.X) nearest = adj;
      } else {
        if (adj.TopLeft!.X + adj.Width > node.TopLeft!.X) continue;
        if (
          !nearest ||
          adj.TopLeft!.X + adj.Width > nearest.TopLeft!.X + nearest.Width
        )
          nearest = adj;
      }
    } else if (forwards) {
      if (adj.TopLeft!.Y < node.TopLeft!.Y + node.Height) continue;
      if (!nearest || adj.TopLeft!.Y < nearest.TopLeft!.Y) nearest = adj;
    } else {
      if (adj.TopLeft!.Y + adj.Height > node.TopLeft!.Y) continue;
      if (
        !nearest ||
        adj.TopLeft!.Y + adj.Height > nearest.TopLeft!.Y + nearest.Height
      )
        nearest = adj;
    }
  }
  return nearest;
}
