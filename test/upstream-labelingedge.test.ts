import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-labelingedge.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Position } from '../src/upstream/label/label.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { LabelPlacementWorkGuard } from '../src/upstream/labeling/guard.js';
import { findBestEdgeLabelPosition } from '../src/upstream/labeling/edge-placement.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go edge label search $trial', (f) => {
  const g = new Graph(),
    a = new Node(1n, 50, 40),
    b = new Node(2n, 50, 40);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(300, 120);
  g.AddNewNodeToContainer(null, a);
  g.AddNewNodeToContainer(null, b);
  if (f.trial % 3 === 0) {
    const n = new Node(3n, 60, 50);
    n.TopLeft = new Point(120, (f.trial % 5) * 20);
    g.AddNewNodeToContainer(null, n);
  }
  const e = g.Connect(a, b);
  e.Points = [
    new Point(50, 20),
    new Point(170, 20),
    new Point(170, 140),
    new Point(300, 140),
  ];
  e.Label = new Label();
  e.Label.Width = 30 + (f.trial % 5) * 10;
  e.Label.Height = 20;
  if (f.trial % 4 === 0) e.Label.Position = Position.UnlockedTop;
  if (f.trial % 7 === 0) e.LabelPercentage = 0.25;
  const guard = new LabelPlacementWorkGuard(
    Background,
    'PlaceLabels',
    1000000n,
  );
  let fake: Node | null = null,
    position = Position.Unset,
    percentage = 0,
    error = '';
  try {
    [fake, position, percentage] = findBestEdgeLabelPosition(
      e,
      g,
      [],
      [],
      guard,
    );
  } catch (err) {
    error = (err as Error).message;
  }
  expect({
    error,
    position,
    percentage,
    remaining: e.LabelPercentage,
    work: Number(guard.used),
  }).toEqual({
    error: f.error,
    position: f.position,
    percentage: f.percentage,
    remaining: f.remaining,
    work: f.work,
  });
  compare(
    fake ? [fake.TopLeft!.X, fake.TopLeft!.Y, fake.Width, fake.Height] : null,
    f.box,
  );
});
