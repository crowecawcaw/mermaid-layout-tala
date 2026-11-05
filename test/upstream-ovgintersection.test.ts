import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgintersection.json';
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
import { addNodesIntersections } from '../src/upstream/routing/ovg-intersections.js';
it.each(fixtures)('matches Go visibility intersections $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    owner = g.AddNode(new Node(1n, 40, 40));
  owner.TopLeft = new Point(0, 0);
  if (trial % 4 === 0) owner.FixedTopLeft = owner.TopLeft.Copy();
  for (let i = 0; i < 2; i++) {
    const n = g.AddNode(new Node(BigInt(i + 2), 20, 30));
    n.TopLeft = new Point(
      ((trial * 7 + i * 31) % 100) - 30,
      ((trial * 11 + i * 23) % 100) - 30,
    );
  }
  const ovg = new OVG(g.Nodes),
    ports: OVGNode[] = [];
  for (let i = 0; i < 7; i++)
    ports.push(
      ovg.AddNode(
        new OVGNode(
          new Point(((i * 5 + trial) % 9) * 10, ((i * 3 + trial) % 9) * 10),
        ),
      ),
    );
  ovg.Ports.set(owner, ports);
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let error = '';
  try {
    addNodesIntersections(ovg, g, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  expect(guard.candidates).toBe(BigInt(f.candidates));
  expect(ovg.Nodes.map((n) => ({ x: n.X, y: n.Y }))).toEqual(f.points);
});
