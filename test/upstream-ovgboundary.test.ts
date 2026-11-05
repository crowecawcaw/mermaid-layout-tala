import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgboundary.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import {
  addNewBoundaryLayers,
  addCornerNodes,
} from '../src/upstream/routing/ovg-boundaries.js';
it.each(fixtures)('matches Go visibility boundary nodes $trial $limit', (f) => {
  const g = new Graph();
  for (let i = 0; i < 3; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 20 + i * 10, 30 + i * 5));
    n.TopLeft = new Point(
      ((f.trial * 7 + i * 43) % 180) - 40,
      ((f.trial * 11 + i * 29) % 160) - 30,
    );
  }
  const ovg = new OVG(g.Nodes);
  for (const [x, y] of [
    [0, 0],
    [50, 0],
    [100, 0],
    [0, 50],
    [100, 50],
    [0, 100],
    [50, 100],
    [100, 100],
  ] as [number, number][])
    ovg.AddNode(new OVGNode(new Point(x, y)));
  const guard = new OVGBuildGuard(Background, {
      ...defaultOVGBuildLimits(),
      work: BigInt(f.limit),
    }),
    tl = new Point(0, 0),
    br = new Point(100, 100);
  let error = '';
  try {
    addNewBoundaryLayers(ovg, g, tl, br, guard);
    addCornerNodes(ovg, g, tl, br, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  expect(ovg.Nodes.map((n) => ({ x: n.X, y: n.Y }))).toEqual(f.points);
});
