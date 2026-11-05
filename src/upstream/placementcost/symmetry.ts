// Translated internal/placementcost/symmetry.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { distanceTo } from '../layoutgraph/node-spatial.js';
import {
  checkScoringCancellation,
  scoringCancellationError,
} from './geometry.js';
import { computeSymmetryScoreInto } from './symmetry-score.js';

export function NodesSymmetry(
  ctx: Context,
  nodes: Node[],
  abductions: EdgeAbduction[] | null,
): number {
  checkScoringCancellation(ctx);
  let sum = 0;
  for (let i = 0; i < nodes.length; i++) {
    scoringCancellationError(ctx, i);
    sum += nodeSymmetry(ctx, nodes[i]!, abductions, true);
  }
  checkScoringCancellation(ctx);
  return sum;
}
export function NodeSymmetry(
  ctx: Context,
  node: Node,
  abductions: EdgeAbduction[] | null,
): number {
  return nodeSymmetry(ctx, node, abductions, true);
}
function nodeSymmetry(
  ctx: Context,
  node: Node,
  abductions: EdgeAbduction[] | null,
  checkNeighbors: boolean,
): number {
  checkScoringCancellation(ctx);
  let score = 0,
    maxScore = 0;
  const used = new Array<boolean>(abductions?.length ?? 0).fill(false),
    added = new Set<Node>(),
    adjacentNodes: Node[] = [];
  const abs = abductions ?? [];
  const isSequence = (n: Node | null): boolean =>
    n !== null && node.Graph!.Sequences.has(n);
  if (node.isContainer) {
    const children: Node[] = [];
    if (abductions === null) {
      const group = node.Graph!.Containers.get(node) ?? [];
      for (let i = 0; i < group.length; i++) {
        scoringCancellationError(ctx, i);
        const child = group[i]!;
        for (let j = 0; j < child.Edges.length; j++) {
          scoringCancellationError(ctx, j);
          const adj = child.Adjacent(child.Edges[j]!);
          if (!isDescendantOf(adj.Container, node)) {
            added.add(child);
            children.push(child);
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < abs.length; i++) {
        scoringCancellationError(ctx, i);
        const ab = abs[i]!;
        if (used[i]) continue;
        if (ab.CurrentFrom === node && ab.OriginallyFrom !== null) {
          used[i] = true;
          if (added.has(ab.OriginallyFrom)) continue;
          added.add(ab.OriginallyFrom);
          children.push(ab.OriginallyFrom);
        }
        if (ab.CurrentTo === node && ab.OriginallyTo !== null) {
          used[i] = true;
          if (added.has(ab.OriginallyTo)) continue;
          added.add(ab.OriginallyTo);
          children.push(ab.OriginallyTo);
        }
      }
    }
    for (let i = 0; i < children.length; i++) {
      scoringCancellationError(ctx, i);
      score += nodeSymmetry(ctx, children[i]!, abductions, checkNeighbors);
      maxScore++;
    }
  }
  for (let edgeIndex = 0; edgeIndex < node.Edges.length; edgeIndex++) {
    scoringCancellationError(ctx, edgeIndex);
    const adjacent = node.Adjacent(node.Edges[edgeIndex]!);
    let replacement = adjacent,
      connectedToChild = false;
    if (node.isContainer) {
      for (let i = 0; i < abs.length; i++) {
        scoringCancellationError(ctx, i);
        const ab = abs[i]!;
        if (
          ab.CurrentFrom === node &&
          ab.CurrentTo === adjacent &&
          ab.OriginallyFrom !== null
        ) {
          connectedToChild = true;
          break;
        }
        if (ab.CurrentFrom === adjacent && ab.CurrentTo === node) {
          used[i] = true;
          if (ab.OriginallyTo !== null) {
            connectedToChild = true;
            break;
          }
        }
      }
    }
    if (connectedToChild) continue;
    for (let i = 0; i < abs.length; i++) {
      scoringCancellationError(ctx, i);
      const ab = abs[i]!;
      if (
        used[i] ||
        ab.CurrentFrom?.isClusterVessel ||
        ab.CurrentTo?.isClusterVessel ||
        isSequence(ab.CurrentFrom) ||
        isSequence(ab.CurrentTo)
      )
        continue;
      if (ab.CurrentFrom === node && ab.CurrentTo === adjacent) {
        used[i] = true;
        replacement = ab.OriginallyTo ?? replacement;
        break;
      }
      if (ab.CurrentFrom === adjacent && ab.CurrentTo === node) {
        used[i] = true;
        replacement = ab.OriginallyFrom ?? replacement;
        break;
      }
    }
    if (
      replacement.Cluster !== null &&
      replacement.Cluster.Vessel!.Graph !== null
    )
      replacement = replacement.Cluster.Vessel!;
    else if (
      replacement.Sequence !== null &&
      replacement.Sequence.Vessel!.Graph !== null
    )
      replacement = replacement.Sequence.Vessel!;
    if (added.has(replacement)) continue;
    adjacentNodes.push(replacement);
    added.add(replacement);
  }
  for (let i = 0; i < abs.length; i++) {
    scoringCancellationError(ctx, i);
    const ab = abs[i]!;
    let connected: Node | null = null;
    if (ab.OriginallyFrom === node)
      connected =
        ab.OriginallyTo !== null &&
        ab.CurrentTo !== null &&
        !ab.CurrentTo.isClusterVessel &&
        !isSequence(ab.CurrentTo)
          ? ab.OriginallyTo
          : ab.CurrentTo;
    if (ab.OriginallyTo === node)
      connected =
        ab.OriginallyFrom !== null &&
        ab.CurrentFrom !== null &&
        !ab.CurrentFrom.isClusterVessel &&
        !isSequence(ab.CurrentFrom)
          ? ab.OriginallyFrom
          : ab.CurrentFrom;
    if (connected !== null && !added.has(connected)) {
      adjacentNodes.push(connected);
      added.add(connected);
    }
  }
  for (let i = 0; i < adjacentNodes.length; i++) {
    scoringCancellationError(ctx, i);
    if (distanceTo(node, adjacentNodes[i]!, true) > 1200) {
      adjacentNodes.splice(i, 1);
      i--;
    }
  }
  const matched = new Array<boolean>(adjacentNodes.length).fill(false);
  score += computeSymmetryScoreInto(ctx, node, adjacentNodes, matched);
  maxScore += adjacentNodes.length;
  if (checkNeighbors) {
    for (let i = 0; i < adjacentNodes.length; i++) {
      scoringCancellationError(ctx, i);
      if (!matched[i])
        score += nodeSymmetry(ctx, adjacentNodes[i]!, abductions, false);
    }
  }
  if (maxScore === 0) return 0;
  checkScoringCancellation(ctx);
  return score / maxScore;
}
