import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingshortcutsafety.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import { shortcutCandidateSafe } from '../src/upstream/routing/shortcut-safety.js';
it.each(fixtures)('matches Go shortcut safety $trial', (f) => {
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
  const boxes: Box[] = [];
  if (f.trial % 3 === 0) {
    const n = g.AddNode(new Node(3n, 40, 40));
    n.TopLeft = new Point(280, 210 + (f.trial % 8) * 10);
  }
  if (f.trial % 3 === 1)
    boxes.push(new Box(new Point(280, 210 + (f.trial % 8) * 10), 40, 40));
  const x = 100 + (f.trial % 9) * 50,
    candidate = [
      new Point(100, 250),
      new Point(x, 250),
      new Point(x, 50),
      new Point(500, 50),
    ];
  const guard = new RouteWorkGuard(Background, 'shortcut', 100000n),
    safe = shortcutCandidateSafe(g, e, candidate, boxes, guard);
  expect({ safe, work: Number(guard.Used()) }).toEqual({
    safe: f.safe,
    work: f.work,
  });
});
