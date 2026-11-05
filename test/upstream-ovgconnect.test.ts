import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgconnect.json';
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
import { connectNodes } from '../src/upstream/routing/ovg-connect.js';
it.each(fixtures)('matches Go visibility sweep $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph();
  for (let i = 0; i < 3; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30, 40));
    n.TopLeft = new Point(
      ((trial * 7 + i * 43) % 160) - 30,
      ((trial * 11 + i * 29) % 130) - 20,
    );
    if (trial % 7 === 0 && i === 0) n.FixedTopLeft = n.TopLeft.Copy();
  }
  const ovg = new OVG(g.Nodes),
    ports: OVGNode[] = [];
  for (let i = 0; i < 25; i++) {
    const n = ovg.AddNode(
      new OVGNode(new Point((i % 5) * 40, Math.trunc(i / 5) * 40)),
    );
    n.Index = i;
    if ((i + trial) % 9 === 0) {
      n.addPortOwner(g.Nodes[0]!, 4 + (i % 4), false);
      ports.push(n);
    }
    if ((i + trial) % 23 === 0) n.IsTunnel = true;
  }
  ovg.Ports.set(g.Nodes[0]!, ports);
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let error = '';
  try {
    connectNodes(ovg, g, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.edges).toBe(BigInt(f.count));
  expect(ovg.Edges.map((e) => [e.From.Index, e.To.Index])).toEqual(f.edges);
});
