import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgedgepoints.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { addPorts } from '../src/upstream/routing/ovg-ports.js';
import {
  perimeterPoints,
  halfwayPoints,
} from '../src/upstream/routing/ovg-edge-points.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go edge visibility points $trial $limit', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 80.5, 60.25)),
    b = g.AddNode(new Node(2n, 70.75, 50.5));
  a.SetShape(f.shapeA);
  a.TopLeft = new Point(0, 0);
  b.SetShape(f.shapeB);
  b.TopLeft = new Point(
    ((f.trial % 5) - 2) * 120,
    ((Math.trunc(f.trial / 5) % 5) - 2) * 100,
  );
  const ovg = new OVG(g.Nodes);
  addPorts(ovg, g, new OVGBuildGuard(Background, defaultOVGBuildLimits()));
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let perimeter: { x: number; y: number }[] | null = null,
    halfway: { x: number; y: number }[] | null = null,
    error = '';
  try {
    perimeter = perimeterPoints(ovg, a, b, guard).map((p) => ({
      x: p.X,
      y: p.Y,
    }));
    halfway = halfwayPoints(ovg, a, b, guard).map((p) => ({ x: p.X, y: p.Y }));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  compare(perimeter, f.perimeter);
  compare(halfway, f.halfway);
});
