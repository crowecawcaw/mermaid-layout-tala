import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-connectedset.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { ConnectedNodeSet } from '../src/upstream/layoutgraph/connected-set.js';
it.each(fixtures)('matches Go connected node membership $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [],
    count = trial % 2 === 0 ? 40 : 12;
  for (let i = 0; i < count; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 20, 20));
    n.TopLeft = new Point(i * 50, 0);
    nodes.push(n);
  }
  for (let i = 1; i < count; i++)
    if ((i + trial) % 5 !== 0) g.Connect(nodes[i - 1]!, nodes[i]!);
  g.Containers.set(null, nodes.slice(0, 2));
  for (let i = 2; i < count; i++) {
    const parent = nodes[i % 2]!;
    parent.isContainer = true;
    const children = g.Containers.get(parent) ?? [];
    children.push(nodes[i]!);
    g.Containers.set(parent, children);
    nodes[i]!.Container = parent;
  }
  const excluded = [nodes[(trial * 11 + 3) % count]!];
  if (trial % 3 === 0) excluded.push(nodes[(trial * 13 + 1) % count]!);
  expect(
    ConnectedNodeSet(nodes[(trial * 7) % count]!, excluded, g)
      .map((n) => Number(n.ID))
      .sort((a, b) => a - b),
  ).toEqual(f.result);
});
