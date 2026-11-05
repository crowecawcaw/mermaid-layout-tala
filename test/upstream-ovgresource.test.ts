import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgresource.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import {
  OVGBuildGuard,
  checkedOVGEdgeCapacity,
} from '../src/upstream/routing/ovg-resource.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go visibility graph resources $trial', (f) => {
  const trial = f.trial,
    guard = new OVGBuildGuard(Background, {
      intersectionCandidates: BigInt(trial % 15),
      nodes: BigInt(trial % 11),
      edges: BigInt(trial % 9),
      work: BigInt(trial % 45),
    }),
    ovg = new OVG(null),
    owner = new Node(1n, 20, 20),
    nodes: OVGNode[] = [],
    events: string[] = [];
  const capture = (fn: () => void) => {
    try {
      fn();
      events.push('');
    } catch (e) {
      events.push((e as Error).message);
    }
  };
  for (let i = 0; i < 10; i++) {
    const node = new OVGNode(
      new Point((i * 3 + trial) % 7, (i * 5 + trial) % 6),
    );
    node.Index = i;
    node.IsNodeCenter = i % 5 === 0;
    if (i % 3 === 0) node.addPortOwner(owner, Orientation.Top, false);
    capture(() => {
      nodes.push(guard.addNode(ovg, node));
    });
  }
  for (let i = 1; i < nodes.length; i++)
    capture(() => {
      guard.connect(ovg, nodes[i - 1]!, nodes[i]!);
    });
  capture(() => guard.reserveCandidates(BigInt(trial % 8)));
  capture(() => guard.reserveSortWork(trial % 8));
  expect(events).toEqual(f.events);
  expect(ovg.Nodes.map((x) => x.Index)).toEqual(f.ids);
  compare(
    ovg.Edges.map((e) => ({
      from: e.From.Index,
      to: e.To.Index,
      distance: e.Distance,
    })),
    f.edges,
  );
  expect([guard.work, guard.nodes, guard.edges, guard.candidates]).toEqual([
    BigInt(f.work),
    BigInt(f.nodes),
    BigInt(f.edgeCount),
    BigInt(f.candidates),
  ]);
});
it('checks edge capacity arithmetic', () => {
  expect(checkedOVGEdgeCapacity(5n, 10n, 3n, 4n, 100n, 100n)).toBe(18);
  expect(() => checkedOVGEdgeCapacity(0n, 1n, 3n, 0n, 100n, 100n)).toThrow(
    'edge capacity arithmetic overflow',
  );
});
