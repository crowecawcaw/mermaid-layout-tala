import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingfallback.json';
import type { Context } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { StraightEdgesFallback } from '../src/upstream/routing/straight-fallback.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go straight fallback $trial', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(200 + (f.trial % 4) * 50, (f.trial % 6) * 30);
  const e = g.Connect(a, b);
  e.Points = [
    new Point(80, 30),
    new Point(130, 30),
    new Point(130, b.TopLeft.Y + 25),
    new Point(b.TopLeft.X, b.TopLeft.Y + 25),
  ];
  if (f.trial % 3 === 0) {
    const c = g.AddNode(new Node(3n, 30, 30));
    c.TopLeft = new Point(140, (f.trial % 5) * 40 - 50);
  }
  if (f.trial % 7 === 0)
    e.TargetArrowheadLabel = Object.assign(new Label(), {
      Text: 'arrow',
      Width: 20,
      Height: 10,
    });
  if (f.trial % 11 === 0) e.FromTableColumnIndex = 0;
  if (f.trial >= 160) {
    const c = g.AddNode(new Node(10n, 40, 40));
    c.TopLeft = new Point(20 + (f.trial % 4) * 30, 200);
    const d = g.AddNode(new Node(11n, 40, 40));
    d.TopLeft = new Point(280, 200 + (f.trial % 3) * 30);
    g.Connect(a, c).Points = [new Point(40, 60), new Point(c.TopLeft.X + 20, c.TopLeft.Y)];
    g.Connect(c, d).Points = [new Point(c.TopLeft.X + 40, c.TopLeft.Y + 20), new Point(d.TopLeft.X, d.TopLeft.Y + 20)];
    g.Connect(d, b).Points = [new Point(d.TopLeft.X + 20, d.TopLeft.Y), new Point(b.TopLeft.X + 35, b.TopLeft.Y + 50)];
  }
  let error = '';
  let checks = 0;
  const context: Context = { Done: () => null, Err: () => { checks++; return null; } };
  try {
    StraightEdgesFallback(context, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(checks).toBe(f.checks);
  compare(
    e.Points.map((p) => ({ x: p.X, y: p.Y })),
    f.route,
  );
  compare(g.Edges.map((edge) => edge.Points.map((p) => ({ x: p.X, y: p.Y }))), f.routes);
});
