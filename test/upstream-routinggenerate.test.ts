import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routinggenerate.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import { generateRoutes } from '../src/upstream/routing/generate-routes.js';
import type { RouteGenerationFlavor } from '../src/upstream/routing/sort-edges.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go full route generation $trial $flavor', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
  const edges = [];
  for (let i = 0; i < 1 + (trial % 3); i++) {
    const e = trial % 4 === 0 && i === 1 ? g.Connect(b, a) : g.Connect(a, b);
    if (trial % 2 === 0) e.TargetArrowhead = 'triangle';
    if (trial % 7 === 0 && i === 0) {
      e.TargetArrowheadLabel = new Label();
      Object.assign(e.TargetArrowheadLabel, {
        Text: 'label',
        Width: 20,
        Height: 10,
      });
    }
    edges.push(e);
  }
  const ovg = buildOVGFromGraphWithLimits(Background, g, []),
    router = new OVGEdgeRouter(
      Background,
      f.flavor as RouteGenerationFlavor,
      ovg,
      g,
      [],
      edges,
    ),
    result = generateRoutes(Background, router, true),
    routes =
      result.Routes?.map((r) => ({
        edge: edges.indexOf(r.GEdge),
        points: r.OVGNodes.map((n) => ({ x: n.X, y: n.Y })),
      })) ?? null;
  expect(result.Err?.message ?? '').toBe(f.error);
  compare(result.Distance, f.distance);
  compare(routes, f.routes);
});
