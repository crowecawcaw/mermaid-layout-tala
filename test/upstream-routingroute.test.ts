import { it } from 'vitest';
import fixtures from './fixtures/upstream-routingroute.json';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import { Point } from '../src/upstream/geo/point.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { Route } from '../src/upstream/routing/route.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go route geometry $trial', (f) => {
  const a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, (f.trial % 3) * 100);
  const edge = new Edge(a, b);
  if (f.trial % 2 === 0) edge.TargetArrowhead = 'triangle';
  const route = new Route(
    edge,
    f.points.map((p) => new OVGNode(new Point(p.x, p.y))),
  );
  route.FromPort = new Point(10, 20);
  route.ToPort = new Point(100, 20);
  const second = new Route(new Edge(a, b), []);
  second.FromPort = new Point(10 + (f.trial % 2) * 5, 20);
  second.ToPort = new Point(100, 20 + (f.trial % 4) * 5);
  const third = new Route(new Edge(a, b), []);
  third.FromPort = new Point(100 + (f.trial % 5), 20);
  third.ToPort = new Point(200, 200);
  const from = new OVGNode(new Point(f.from.x, f.from.y)),
    to = new OVGNode(new Point(f.to.x, f.to.y)),
    guard = {
      used: 0,
      Step() {
        this.used++;
      },
    };
  const swap = route.canSwapEdgesGuarded(second, [route, second, third], guard);
  compare(
    {
      segments: route.createSegmentEndpoints().map((p) => ({ x: p.X, y: p.Y })),
      entire: route.isEntireColinear(from, to),
      opposing: route.isOpposingColinear(from, to),
      swap,
      work: guard.used,
    },
    f.expected,
  );
});
