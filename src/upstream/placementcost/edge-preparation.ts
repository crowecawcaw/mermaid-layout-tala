// Translated internal/placementcost/edge_length.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { Orientation as O } from '../geo/orientation.js';
import { scoringCancellationError } from './geometry.js';

export interface EdgeLengthOptions {
  EdgeAbductions: EdgeAbduction[] | null;
  IncludeNodeSizes: boolean;
  EnforceMinimumGap: boolean;
  PenalizeDirection: boolean;
}
export interface EdgeLengthPreparation {
  nRepl: Node[];
  aRepl: Node[];
  labeledEdgeCount: Map<string, number>;
  direction: O;
  directionFactor: number;
}
export function edgePairKey(from: Node, to: Node): string {
  return `${from.ID},${to.ID}`;
}
function checkSlice(ctx: Context, length: number): void {
  for (let i = 0; i < length; i += 64) scoringCancellationError(ctx, i);
}
export function prepareNodeEdgeLength(
  ctx: Context,
  node: Node,
  options: EdgeLengthOptions,
): EdgeLengthPreparation {
  const graph = node.Graph!;
  let abductions = options.EdgeAbductions;
  if (abductions === null) {
    abductions = [];
    const clusters = graph.ClusterOrder();
    for (let i = 0; i < clusters.length; i++) {
      scoringCancellationError(ctx, i);
      abductions.push(...graph.Clusters.get(clusters[i]!)!.EdgeAbductions);
    }
  }
  const used = new Array<boolean>(abductions.length).fill(false);
  const nRepl: Node[] = [],
    aRepl: Node[] = [];
  checkSlice(ctx, used.length);
  checkSlice(ctx, node.Edges.length);
  checkSlice(ctx, node.Edges.length);
  for (let i = 0; i < node.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    const edge = node.Edges[i]!,
      adjacent = node.Adjacent(edge);
    let n = node,
      a = adjacent;
    if (options.IncludeNodeSizes) {
      for (let j = 0; j < abductions.length; j++) {
        scoringCancellationError(ctx, j);
        if (used[j]) continue;
        const abduction = abductions[j]!;
        if (
          abduction.CurrentFrom === node &&
          abduction.CurrentTo === adjacent
        ) {
          used[j] = true;
          a = abduction.OriginallyTo ?? a;
          n = abduction.OriginallyFrom ?? n;
          break;
        }
        if (
          abduction.CurrentFrom === adjacent &&
          abduction.CurrentTo === node
        ) {
          used[j] = true;
          a = abduction.OriginallyFrom ?? a;
          n = abduction.OriginallyTo ?? n;
          break;
        }
      }
    }
    nRepl.push(n);
    aRepl.push(a);
  }
  let direction = graph.Direction(node.container()),
    directionFactor = 0;
  if (options.PenalizeDirection) {
    if (direction !== O.NONE)
      directionFactor = options.IncludeNodeSizes ? 6 : 1.5;
    else {
      if (node.IsTable()) {
        direction = O.Right;
        directionFactor = 0.5;
      } else {
        const counts = new Map<Node, number>(),
          fromCounts = new Map<Node, number>();
        let multiple: Node | null = null;
        if (options.IncludeNodeSizes) {
          for (let i = 0; i < node.Edges.length; i++) {
            scoringCancellationError(ctx, i);
            const edge = node.Edges[i]!,
              n = nRepl[i]!,
              a = aRepl[i]!;
            if (
              n !== node ||
              a !== node.Adjacent(edge) ||
              edge.Label === null ||
              a === n
            )
              continue;
            counts.set(a, (counts.get(a) ?? 0) + 1);
            const [semanticFrom, , directed] = edge.DirectedEndpoints();
            if ((directed ? semanticFrom : edge.From) === node)
              fromCounts.set(a, (fromCounts.get(a) ?? 0) + 1);
            if (counts.get(a)! > 2) multiple = a;
          }
        }
        if (multiple !== null) {
          direction =
            (fromCounts.get(multiple) ?? 0) >
            Math.floor(counts.get(multiple)! / 2)
              ? O.Left
              : O.Right;
          directionFactor = 10;
        } else {
          direction = O.BottomRight;
          directionFactor = 0.3;
        }
      }
      if (node.isClusterVessel) {
        directionFactor = 0.2;
        const arrangement = graph.Clusters.get(node)!.Arrangement;
        if (arrangement === 'Row') direction = O.Bottom;
        else if (arrangement === 'Column') direction = O.Right;
      }
    }
  }
  const labeledEdgeCount = new Map<string, number>();
  for (let i = 0; i < node.Edges.length; i++) {
    scoringCancellationError(ctx, i);
    if (!options.IncludeNodeSizes || node.Edges[i]!.Label === null) continue;
    const key = edgePairKey(nRepl[i]!, aRepl[i]!);
    labeledEdgeCount.set(key, (labeledEdgeCount.get(key) ?? 0) + 1);
  }
  return { nRepl, aRepl, labeledEdgeCount, direction, directionFactor };
}
