import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgportindex.json';
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
  OVGPortIndex,
  hasUnobstructedLineToPorts,
} from '../src/upstream/routing/ovg-port-index.js';
it.each(fixtures)('matches Go visibility port index $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    owner = g.AddNode(new Node(1n, 40, 40));
  owner.TopLeft = new Point(0, 0);
  owner.IsInvisible = trial % 7 === 0;
  for (let i = 0; i < 3; i++) {
    const n = g.AddNode(new Node(BigInt(i + 2), 20, 30));
    n.TopLeft = new Point(
      ((trial * 7 + i * 31) % 100) - 30,
      ((trial * 11 + i * 23) % 100) - 30,
    );
  }
  const ovg = new OVG(g.Nodes),
    ports = [];
  for (let i = 0; i < 10; i++)
    ports.push(
      new OVGNode(
        new Point(((i * 7 + trial) % 7) * 10, ((i * 3 + trial) % 7) * 10),
      ),
    );
  ovg.Ports.set(owner, ports);
  const guard = new OVGBuildGuard(Background, defaultOVGBuildLimits()),
    index = new OVGPortIndex(ovg.Ports, g, new Set(), guard),
    answers = [];
  for (let i = 0; i < 30; i++) {
    const x = (((trial + i * 7) % 13) - 3) * 10,
      y = (((trial + i * 11) % 13) - 3) * 10;
    answers.push({
      near: index.tooClose(x, y, (i % 4) * 5, guard),
      visible: hasUnobstructedLineToPorts(
        new OVGNode(new Point(x, y)),
        ovg,
        index,
        2,
        guard,
      ),
    });
  }
  expect(answers).toEqual(f.answers);
  expect(guard.work).toBe(BigInt(f.work));
});
