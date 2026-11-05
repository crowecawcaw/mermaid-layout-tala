import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsshape.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { nodeOrientation } from '../src/upstream/layoutgraph/node-spatial.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import {
  RouteChecker,
  preferLaunchingVertically,
} from '../src/upstream/routing/slingshot-geometry.js';
import { findSShapedRoute } from '../src/upstream/routing/slingshot.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go S-shaped routing $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50)),
    c = g.AddNode(new Node(3n, 30, 30));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(160 + (trial % 4) * 20, 130 + (trial % 5) * 20);
  c.TopLeft = new Point(60 + (trial % 6) * 20, 70 + (trial % 4) * 20);
  const edge = g.Connect(a, b);
  edge.TargetArrowhead = 'triangle';
  const ovg = buildOVGFromGraphWithLimits(Background, g, []),
    router = new OVGEdgeRouter(Background, 'Default', ovg, g, [], [edge]),
    orientation = nodeOrientation(a, b),
    [vertical, strong] = preferLaunchingVertically(a, b, orientation),
    order = vertical ? [true, false] : [false, true];
  let points: { x: number; y: number }[] | null = null,
    cost = 0,
    error = '';
  try {
    const [path, value] = findSShapedRoute(
      Background,
      router,
      order,
      vertical,
      strong,
      edge,
      orientation,
      new RouteChecker(() => false),
      new RouteChecker(() => false),
    );
    points = path?.map((n) => ({ x: n.X, y: n.Y })) ?? null;
    cost = Number.isFinite(value) ? value : -1;
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(cost, f.cost);
  compare(points, f.points);
});
