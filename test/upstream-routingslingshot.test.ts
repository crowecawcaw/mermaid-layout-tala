import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingslingshot.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import { slingshot } from '../src/upstream/routing/slingshot.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go slingshot routing $trial', (f) => {
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
  if (trial % 7 === 0) {
    edge.TargetArrowheadLabel = new Label();
    Object.assign(edge.TargetArrowheadLabel, {
      Text: 'label',
      Width: 20,
      Height: 10,
    });
  }
  const ovg = buildOVGFromGraphWithLimits(Background, g, []),
    router = new OVGEdgeRouter(Background, 'Default', ovg, g, [], [edge]);
  let points: { x: number; y: number }[] | null = null,
    cost = 0,
    error = '';
  try {
    const [path, c] = slingshot(Background, router, edge);
    cost = Number.isFinite(c) ? c : -1;
    points = path?.map((n) => ({ x: n.X, y: n.Y })) ?? null;
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(cost, f.cost);
  compare(points, f.points);
});
