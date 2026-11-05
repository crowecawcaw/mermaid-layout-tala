import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingfallback.json';
import { Background } from '../src/upstream/limits/context.js';
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
  let error = '';
  try {
    StraightEdgesFallback(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    e.Points.map((p) => ({ x: p.X, y: p.Y })),
    f.route,
  );
});
