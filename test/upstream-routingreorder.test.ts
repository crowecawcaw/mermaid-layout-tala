import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingreorder.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { ReorderDuplicates } from '../src/upstream/routing/reorder-duplicates.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go duplicate route ordering $trial', (f) => {
  const g = new Graph(),
    a = new Node(1n, 40, 40),
    b = new Node(2n, 40, 40);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(300, 0);
  g.AddNewNodeToContainer(null, a);
  g.AddNewNodeToContainer(null, b);
  for (let i = 0; i < 3; i++) {
    const e = g.Connect(a, b);
    e.Points = [new Point(40, 10 + i * 10), new Point(300, 10 + i * 10)];
    if (i === 1)
      e.Label = Object.assign(new Label(), {
        Text: 'label',
        Width: 40,
        Height: 20,
      });
    if (f.trial % 3 === 0 && i === 2) {
      [e.From, e.To] = [e.To, e.From];
      e.Points.reverse();
    }
    if (f.trial % 5 === 0 && i === 0)
      e.Label = Object.assign(new Label(), {
        Text: 'other',
        Width: 40,
        Height: 20,
      });
    if (f.trial % 7 === 0 && i === 2)
      e.Label = Object.assign(new Label(), {
        Text: 'other',
        Width: 40,
        Height: 20,
      });
  }
  let error = '';
  try {
    ReorderDuplicates(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
