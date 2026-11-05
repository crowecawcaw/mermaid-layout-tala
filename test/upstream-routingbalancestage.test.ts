import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingbalancestage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { balanceEdgeSegmentsWithLimit } from '../src/upstream/routing/balance-segments.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches Go segment balancing stage $trial', (f) => {
  const g = new Graph();
  for (let i = 0; i < 4; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point((i % 2) * 200, Math.floor(i / 2) * 180);
    if (f.trial % 4 === 0 && i === 0) n.SetShape('diamond');
    g.AddNewNodeToContainer(null, n);
  }
  for (let i = 0; i < 3; i++) {
    const e = g.Connect(g.Nodes[i]!, g.Nodes[(i + 1) % 4]!),
      x = 60 + i * 24 + (f.trial % 7),
      y = 40 + i * 20;
    e.Points = [
      new Point(x, 30),
      new Point(x, y),
      new Point(x + 65, y),
      new Point(x + 65, y + 50),
      new Point(x + 100, y + 50),
      new Point(x + 100, 180),
    ];
  }
  let error = '';
  try {
    balanceEdgeSegmentsWithLimit(
      Background,
      g,
      BigInt(f.trial >= 120 ? 50_000_000 : 1 + f.trial * 15),
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
