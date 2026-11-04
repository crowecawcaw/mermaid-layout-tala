// Translated internal/placementcost/cluster.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Cluster } from '../layoutgraph/records.js';
import type { Node } from '../layoutgraph/node.js';
export function clusterExactlyTwoExternalConnectedNodes(
  cluster: Cluster,
): [Node | null, Node | null, boolean] {
  const currentGraph = cluster.Nodes[0]!.Graph;
  let first: Node | null = null,
    second: Node | null = null,
    moreThanTwo = false;
  for (const a of cluster.EdgeAbductions) {
    let external: Node | null = null;
    if (a.OriginallyFrom === null && a.OriginallyTo !== null) {
      if (
        a.CurrentFrom!.TopLeft !== null &&
        a.CurrentFrom!.Graph === currentGraph
      )
        external = a.CurrentFrom;
    } else if (a.OriginallyTo === null && a.OriginallyFrom !== null) {
      if (a.CurrentTo!.TopLeft !== null && a.CurrentTo!.Graph === currentGraph)
        external = a.CurrentTo;
    }
    if (external === null || external === first || external === second)
      continue;
    if (first === null) {
      first = external;
      continue;
    }
    if (second === null) {
      second = external;
      continue;
    }
    moreThanTwo = true;
  }
  return [first, second, !moreThanTwo && first !== null && second !== null];
}
