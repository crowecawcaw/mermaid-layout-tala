import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingnudgestage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { nudgeChannelsWithLimit } from '../src/upstream/routing/nudge-channels.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go channel nudging stage $trial', (f) => {
  const g = new Graph(),
    from = g.AddNode(new Node(1n, 100, 100)),
    to = g.AddNode(new Node(2n, 100, 100));
  from.TopLeft = new Point(0, 0);
  to.TopLeft = new Point(300, 200);
  const x = 110 + (f.trial % 15) * 5,
    e = g.Connect(from, to);
  e.Points = [
    new Point(100, 50),
    new Point(x, 50),
    new Point(x, 250),
    new Point(300, 250),
  ];
  if (f.trial % 4 === 0) {
    from.SetShape('diamond');
    to.SetShape('diamond');
  }
  if (f.trial % 3 === 0) {
    const duplicate = g.Connect(from, to);
    duplicate.Points = e.Points.map((p) => p.Copy());
  }
  let error = '';
  try {
    nudgeChannelsWithLimit(
      Background,
      g,
      BigInt(f.trial >= 120 ? 50_000_000 : 1 + f.trial * 20),
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
