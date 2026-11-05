import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingcrosshatch.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { setSliceCapacity } from '../src/upstream/layoutgraph/topology-preflight.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { crosshatchWithWorkLimit } from '../src/upstream/routing/crosshatch.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go crosshatch work limit $trial', (f) => {
  const g = new Graph(),
    left = new Node(1n, 100, 100),
    right = new Node(2n, 100, 100),
    extLeft = new Node(3n, 100, 100),
    extRight = new Node(4n, 100, 100);
  left.TopLeft = new Point(0, 0);
  right.TopLeft = new Point(0, 200);
  extLeft.TopLeft = new Point(400, 0);
  extRight.TopLeft = new Point(400, 200);
  for (const n of [left, right, extLeft, extRight])
    g.AddNewNodeToContainer(null, n);
  const vessel = new Node(5n, 250, 400);
  vessel.TopLeft = new Point(-50, -50);
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
  const a = g.Connect(left, extLeft),
    b = g.Connect(right, extRight);
  a.Points = setSliceCapacity([new Point(100, 100), new Point(400, 50)], 5);
  b.Points = setSliceCapacity([new Point(100, 100), new Point(400, 250)], 5);
  cluster.EdgeAbductions = [
    {
      Edge: a,
      OriginallyFrom: left,
      OriginallyTo: null,
      CurrentFrom: left,
      CurrentTo: extLeft,
    },
    {
      Edge: b,
      OriginallyFrom: right,
      OriginallyTo: null,
      CurrentFrom: right,
      CurrentTo: extRight,
    },
  ];
  let error = '';
  try {
    crosshatchWithWorkLimit(Background, g, BigInt(1 + f.trial * 8));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    [a, b].map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
