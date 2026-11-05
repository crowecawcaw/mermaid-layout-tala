import { expect, it } from 'vitest';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { clusterExternalConnectedNodes } from '../src/upstream/placement/cluster-connections.js';

it('keeps positioned external nodes in first-seen order and omits foreign graphs', () => {
  const graph = new Graph(),
    other = new Graph(),
    member = new Node(1n, 10, 10),
    a = new Node(2n, 10, 10),
    b = new Node(3n, 10, 10),
    foreign = new Node(4n, 10, 10);
  for (const n of [member, a, b]) graph.AddNodeUnchecked(n);
  other.AddNodeUnchecked(foreign);
  for (const n of [member, a, b, foreign]) n.TopLeft = new Point(0, 0);
  const cluster = new Cluster();
  cluster.Nodes = [member];
  cluster.EdgeAbductions = [a, b, a, foreign].map((n) => ({
    Edge: graph.Connect(n, member),
    CurrentFrom: n,
    CurrentTo: member,
    OriginallyFrom: null,
    OriginallyTo: member,
  }));
  expect(clusterExternalConnectedNodes(cluster)).toEqual([a, b]);
});
