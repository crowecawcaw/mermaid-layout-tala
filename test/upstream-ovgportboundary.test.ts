import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgportboundary.json';
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
import { addPortConnectionNodesAtBoundaries } from '../src/upstream/routing/ovg-port-boundaries.js';
it.each(fixtures)('matches Go port boundary connections $trial $limit', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 30, 40));
  a.SetShape(f.shape);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(
    ((f.trial * 7) % 200) - 70,
    ((f.trial * 11) % 160) - 50,
  );
  const ovg = new OVG([a]);
  addPorts(ovg, g, new OVGBuildGuard(Background, defaultOVGBuildLimits()));
  ovg.NodesInsideBoundingBox = g.Nodes;
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let error = '';
  try {
    addPortConnectionNodesAtBoundaries(
      ovg,
      g,
      new Point(-40, -30),
      new Point(120, 100),
      guard,
    );
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  expect(ovg.Nodes.map((n) => ({ x: n.X, y: n.Y }))).toEqual(f.points);
});
