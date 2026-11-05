import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingline.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { routeLineGuarded } from '../src/upstream/routing/route-line.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go straight route selection $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50)),
    c = g.AddNode(new Node(3n, 30, 30));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(
    ((trial % 5) - 2) * 100,
    ((Math.trunc(trial / 5) % 5) - 2) * 100,
  );
  c.TopLeft = new Point(((trial * 7) % 240) - 100, ((trial * 11) % 220) - 100);
  const e = g.Connect(a, b);
  e.SourceArrowhead = 'triangle';
  if (trial % 9 === 0) {
    e.TargetArrowheadLabel = new Label();
    Object.assign(e.TargetArrowheadLabel, {
      Text: 'label',
      Width: 20,
      Height: 10,
    });
  }
  if (trial % 3 === 0) {
    const other = g.Connect(a, c);
    other.SourceArrowhead = 'triangle';
    other.Points = [new Point(80, 30), new Point(120, 30), new Point(120, 90)];
  }
  const guard = new RouteSearchWorkGuard(
    Background,
    'Default',
    BigInt(f.limit),
  );
  let from: { x: number; y: number } | null = null,
    to: { x: number; y: number } | null = null,
    cost = 0,
    error = '';
  try {
    const [a, b, c] = routeLineGuarded(g, e, g.Edges, null, guard);
    from = { x: a.X, y: a.Y };
    to = { x: b.X, y: b.Y };
    cost = c;
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.Used()).toBe(BigInt(f.work));
  compare({ from, to, cost }, { from: f.from, to: f.to, cost: f.cost });
});
