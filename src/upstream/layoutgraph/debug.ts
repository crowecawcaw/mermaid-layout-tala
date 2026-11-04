// Translated diagnostic IDs from internal/layoutgraph at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Cluster, Sequence } from './records.js';
export function nodesDebugID(nodes: Node[]): string {
  return '[' + nodes.map(nodeDebugID).join(', ') + ']';
}
export function clusterDebugID(cluster: Cluster): string {
  return nodesDebugID(cluster.Nodes) + '; Arrangement: ' + cluster.Arrangement;
}
export function sequenceDebugID(sequence: Sequence): string {
  return nodesDebugID(sequence.Nodes);
}
export function nodeDebugID(node: Node | null): string {
  if (node === null) return 'nil';
  if (node.D2ID !== null) return node.D2ID;
  if (node.isClusterVessel)
    return (
      'Cluster vessel of: ' + clusterDebugID(node.Graph!.Clusters.get(node)!)
    );
  if (node.Graph !== null && node.Graph.Sequences.size > 0) {
    const sequence = node.Graph.Sequences.get(node);
    if (sequence !== undefined)
      return 'Sequence vessel of: ' + sequenceDebugID(sequence);
  }
  return String(node.ID);
}
