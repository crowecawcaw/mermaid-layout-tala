import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingshortcutstage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { shortcutRoutesWithLimit } from '../src/upstream/routing/shortcut-routes.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go shortcut stage $trial', (f) => {
  const g = new Graph(),
    from = g.AddNode(new Node(1n, 100, 100)),
    to = g.AddNode(new Node(2n, 100, 100));
  from.TopLeft = new Point(0, 200);
  to.TopLeft = new Point(500, 0);
  const e = g.Connect(from, to);
  e.Points = [
    new Point(100, 250),
    new Point(200, 250),
    new Point(200, 150),
    new Point(400, 150),
    new Point(400, 50),
    new Point(500, 50),
  ];
  if (f.trial % 3 === 0) {
    const n = g.AddNode(new Node(3n, 40, 40));
    n.TopLeft = new Point(280, 210 + (f.trial % 8) * 20);
  }
  if (f.trial % 2 === 0) {
    for (const n of g.Nodes)
      [n.TopLeft!.X, n.TopLeft!.Y] = [n.TopLeft!.Y, n.TopLeft!.X];
    for (const p of e.Points) [p.X, p.Y] = [p.Y, p.X];
  }
  let error = '';
  try {
    shortcutRoutesWithLimit(
      Background,
      g,
      BigInt(f.trial >= 120 ? 50_000_000 : 1 + f.trial * 20),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    e.Points.map((p) => ({ x: p.X, y: p.Y })),
    f.route,
  );
});
