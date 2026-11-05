import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementdejitter.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Dejitter } from '../src/upstream/placement/dejitter.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go node dejitter $trial', (f) => {
  const g = new Graph();
  g.CellSize = 50;
  const offset = 5 + (f.trial % 10) * 10;
  const a = g.AddNode(new Node(1n, 40, 30)),
    b = g.AddNode(new Node(2n, 40, 30));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(offset, 200);
  const nodes = [a, b],
    edge = g.Connect(a, b);
  edge.Points = [
    new Point(20, 30),
    new Point(20, 80),
    new Point(20 + offset, 80),
    new Point(20 + offset, 200),
  ];
  if (f.trial % 4 === 0) a.FixedTopLeft = a.TopLeft.Copy();
  if (f.trial % 5 === 0) b.FixedTopLeft = b.TopLeft.Copy();
  if (f.trial % 3 === 0) {
    const n = g.AddNode(new Node(3n, 20, 20));
    n.TopLeft = new Point(25 + offset / 2, 90);
    nodes.push(n);
  }
  if (f.trial % 2 === 0) {
    for (const n of nodes) {
      [n.TopLeft!.X, n.TopLeft!.Y] = [n.TopLeft!.Y, n.TopLeft!.X];
      [n.Width, n.Height] = [n.Height, n.Width];
    }
    for (const p of edge.Points) [p.X, p.Y] = [p.Y, p.X];
  }
  g.Containers.set(null, nodes);
  let changed = false,
    error = '';
  try {
    changed = Dejitter(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(changed).toBe(f.changed);
  compare(
    nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
    f.nodes,
  );
  compare(
    edge.Points.map((p) => ({ x: p.X, y: p.Y })),
    f.route,
  );
});
