import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routinggenerated.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)(
  'matches Go search on generated visibility graph $trial',
  (f) => {
    const trial = f.trial,
      g = new Graph(),
      a = g.AddNode(new Node(1n, 80, 60)),
      b = g.AddNode(new Node(2n, 70, 50));
    a.SetShape(f.shapeA);
    a.TopLeft = new Point(0, 0);
    b.SetShape(f.shapeB);
    b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
    const edge = g.Connect(a, b);
    edge.TargetArrowhead = 'triangle';
    const ovg = buildOVGFromGraphWithLimits(Background, g, []),
      router = new OVGEdgeRouter(Background, 'Default', ovg, g, [], [edge]);
    let points: { x: number; y: number }[] | null = null,
      cost = 0,
      error = '';
    try {
      const [path, c] = router.search(Background, edge);
      points = path.map((n) => ({ x: n.X, y: n.Y }));
      cost = c;
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error).toBe(f.error);
    compare(cost, f.cost);
    compare(points, f.points);
  },
);
