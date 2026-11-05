import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingswapstage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { setSliceCapacity } from '../src/upstream/layoutgraph/topology-preflight.js';
import { swapAllEdgePortsWithWorkLimit } from '../src/upstream/routing/swap-ports.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go swap edge ports $trial', (f) => {
  const g = new Graph(),
    container = g.AddNode(new Node(1n, 200, 100)),
    remote = g.AddNode(new Node(2n, 50, 50)),
    node = g.AddNode(new Node(3n, 50, 50));
  container.TopLeft = new Point(0, 150);
  remote.TopLeft = new Point(200, 0);
  node.TopLeft = new Point(100, 175);
  const a = g.Connect(node, remote),
    b = g.Connect(remote, node);
  a.Points = setSliceCapacity(
    [new Point(138, 175), new Point(138, 25), new Point(200, 25)],
    6,
  );
  b.Points = setSliceCapacity(
    [
      new Point(225, 50),
      new Point(225, 75),
      new Point(112, 75),
      new Point(112, 175),
    ],
    7,
  );
  g.AddNodeToContainer(null, container);
  g.AddNodeToContainer(null, remote);
  g.AddNodeToContainer(container, node);
  let error = '';
  try {
    swapAllEdgePortsWithWorkLimit(Background, g, BigInt(1 + f.trial * 10));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
