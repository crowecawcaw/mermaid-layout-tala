import { it } from 'vitest';
import fixtures from './fixtures/upstream-clusteralignment.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import {
  alignConnectedNodes,
  alignVessel,
} from '../src/upstream/placement/cluster-alignment.js';
it.each(fixtures)('matches Go cluster alignment $trial', (f) => {
  const g = new Graph(),
    v = new Node(1n, 60, 80),
    member = new Node(2n, 20, 20);
  v.TopLeft = new Point(f.trial % 30, f.trial % 20);
  member.TopLeft = new Point(0, 0);
  g.AddNode(v);
  g.AddNode(member);
  const cluster = new Cluster();
  cluster.Vessel = v;
  cluster.Nodes = [member];
  cluster.Graph = g;
  const ext = Array.from({ length: 3 }, (_, i) => {
    const n = new Node(BigInt(i + 3), 20, 30);
    n.TopLeft = new Point(
      ((f.trial * 11 + i * 61) % 200) - 50,
      ((f.trial * 7 + i * 47) % 200) - 50,
    );
    g.AddNode(n);
    if (i === 0 && f.trial % 4 === 0) n.FixedTopLeft = new Point(0, 0);
    const edge = g.Connect(n, member);
    cluster.EdgeAbductions.push({
      Edge: edge,
      CurrentFrom: n,
      CurrentTo: member,
      OriginallyFrom: null,
      OriginallyTo: member,
    });
    return n;
  });
  alignConnectedNodes(cluster, f.trial % 2 === 0);
  compare(
    ext.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.external,
  );
  alignVessel(cluster, f.trial % 2 === 0);
  compare([v.TopLeft!.X, v.TopLeft!.Y], f.vessel);
});
