// Translated internal/placement/cluster_connections.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Cluster } from '../layoutgraph/records.js';
import type { Node } from '../layoutgraph/node.js';
export function clusterExternalConnectedNodes(cluster: Cluster): Node[] {
  const graph = cluster.Nodes[0]!.Graph,
    seen = new Set<Node>(),
    external: Node[] = [];
  for (const ab of cluster.EdgeAbductions) {
    let node: Node | null = null;
    if (ab.OriginallyFrom === null && ab.OriginallyTo !== null)
      node = ab.CurrentFrom!;
    else if (ab.OriginallyTo === null && ab.OriginallyFrom !== null)
      node = ab.CurrentTo!;
    else continue;
    if (node!.TopLeft !== null && node!.Graph === graph && !seen.has(node!)) {
      external.push(node!);
      seen.add(node!);
    }
  }
  return external;
}
