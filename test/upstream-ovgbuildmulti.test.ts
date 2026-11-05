import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgbuildmulti.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
it.each(fixtures)('matches Go connected visibility graph $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.SetShape(f.shapeA);
  a.TopLeft = new Point(0, 0);
  b.SetShape(f.shapeB);
  b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
  g.Connect(a, b);
  const ovg = buildOVGFromGraphWithLimits(Background, g, []),
    key = (p: Point) => `${p.X},${p.Y}`,
    nodes = ovg.Nodes.map((n) => key(n.Point)).sort(),
    edges = ovg.Edges.map((e) =>
      [key(e.From.Point), key(e.To.Point)].sort().join('|'),
    ).sort();
  expect(nodes).toEqual(f.nodes);
  expect(edges).toEqual(f.edges);
});
