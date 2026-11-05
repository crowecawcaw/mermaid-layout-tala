import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingcoordinator.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { routeEdgesWithResourceGuards } from '../src/upstream/routing/coordinator.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go route coordinator $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
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
  }
  let error = '';
  try {
    routeEdgesWithResourceGuards(
      Background,
      g,
      [],
      new OVGBuildGuard(Background, defaultOVGBuildLimits()),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
