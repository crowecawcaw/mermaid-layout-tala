import { initializeByGraphDistance } from '../src/upstream/placement/stress-initialize.js';
import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-initialize.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { initializeNodes } from '../src/upstream/placement/initialize.js';

it.each(fixtures)('matches Go initialization $trial', (f) => {
  const g = new Graph();
  g.CellSize = f.cell;
  const nodes = Array.from({ length: f.count }, (_, j) => {
    const n = new Node(BigInt(j + 1), 20 + j * 5, 20 + j * 3);
    g.AddNewNodeToContainer(null, n);
    return n;
  });
  if (f.fixed) nodes[0]!.FixedTopLeft = new Point(f.trial % 60, f.trial % 45);
  f.edges.forEach((r, j) => {
    const e = g.Connect(nodes[j]!, nodes[j + 1]!);
    e.SourceArrowhead = r.source;
    e.TargetArrowhead = r.target;
  });
  const stress = initializeByGraphDistance(Background, g);
  compare(stress, f.stress);
  if (stress) {
    compare(
      nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
      f.stressPositions,
    );
    for (const n of nodes) n.TopLeft = null;
  }
  initializeNodes(Background, g);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.positions,
  );
});

it('restores original positions when a disconnected node is missed', () => {
  const g = new Graph();
  g.CellSize = 20;
  const a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20),
    c = new Node(3n, 20, 20);
  for (const node of [a, b, c]) g.AddNewNodeToContainer(null, node);
  const original = new Point(4, 5);
  a.TopLeft = original;
  g.Connect(a, b);
  expect(() => initializeNodes(Background, g)).toThrow(
    'missed initializing node',
  );
  expect(a.TopLeft).toBe(original);
  expect([original.X, original.Y]).toEqual([4, 5]);
  expect(b.TopLeft).toBeNull();
  expect(c.TopLeft).toBeNull();
});
