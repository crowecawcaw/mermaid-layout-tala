import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingbranch.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { setSliceCapacity } from '../src/upstream/layoutgraph/topology-preflight.js';
import { fixClusterEdgeBranchingWithLimit } from '../src/upstream/routing/cluster-branching.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go cluster branching $trial', (f) => {
  const g = new Graph(),
    external = new Node(1n, 10, 10),
    left = new Node(2n, 10, 10),
    right = new Node(3n, 10, 10);
  external.TopLeft = new Point(10000, 10000);
  left.TopLeft = new Point(11000, 11000);
  right.TopLeft = new Point(12000, 12000);
  for (const n of [external, left, right]) g.AddNewNodeToContainer(null, n);
  const vessel = new Node(4n, 10, 10);
  vessel.TopLeft = new Point(11000, 11000);
  vessel.Graph = g;
  const cluster = new Cluster();
  cluster.Vessel = vessel;
  cluster.Nodes = [left, right];
  cluster.Arrangement = 'Row';
  cluster.DesiredArrangement = 'Row';
  cluster.Graph = g;
  left.Cluster = cluster;
  right.Cluster = cluster;
  g.Clusters.set(vessel, cluster);
  const a = g.Connect(external, left),
    b = g.Connect(external, right);
  a.Points = setSliceCapacity(
    [
      new Point(0, 0),
      new Point(0, -10),
      new Point(-100, -10),
      new Point(-100, 100),
    ],
    7,
  );
  b.Points = setSliceCapacity(
    [new Point(0, 0), new Point(0, 10), new Point(100, 10), new Point(100, -5)],
    7,
  );
  let error = '';
  try {
    fixClusterEdgeBranchingWithLimit(Background, g, BigInt(1 + f.trial * 10));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
