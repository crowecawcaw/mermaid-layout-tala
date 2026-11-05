import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingswapgeometry.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import {
  doesNotPassThroughNodesGuarded,
  isUShaped,
  isSShaped,
  isLShaped,
} from '../src/upstream/routing/swap-port-geometry.js';
it.each(fixtures)('matches Go port swap geometry $trial', (f) => {
  const g = new Graph(),
    a = new Node(1n, 50, 40),
    b = new Node(2n, 50, 40),
    c = new Node(3n, 20, 20);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(200, 100);
  c.TopLeft = new Point(80 + (f.trial % 5) * 10, (f.trial % 4) * 20);
  for (const n of [a, b, c]) g.AddNewNodeToContainer(null, n);
  const e = g.Connect(a, b);
  e.Points = [
    new Point(50, 10),
    new Point(100, 10),
    new Point(100, 80),
    new Point(200, 80 + (f.trial % 3) * 20),
  ];
  if (f.trial % 2 === 0) e.Points = e.Points.slice(0, 3);
  const guard = new RouteWorkGuard(Background, 'SwapEdgePorts', 100000n),
    safe = doesNotPassThroughNodesGuarded(
      g,
      [a, b],
      new Point(50, 10),
      new Point(200, 10),
      new Point(50, 70),
      new Point(200, 70),
      guard,
    );
  expect({
    u: isUShaped(e.Points),
    s: isSShaped(e.Points),
    l: isLShaped(e.Points),
    safe,
  }).toEqual({ u: f.u, s: f.s, l: f.l, safe: f.safe });
});
