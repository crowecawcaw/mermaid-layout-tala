import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-qualityinspection.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Position } from '../src/upstream/label/label.js';
import { inspectWithLimit } from '../src/upstream/quality/inspection.js';

it.each(fixtures)('matches Go quality inspection $trial', (f) => {
  const g = new Graph();
  for (let i = 0; i < 5; i++) {
    const n = new Node(BigInt(i + 1), 30 + i * 5, 20 + i * 3);
    n.TopLeft = new Point(
      (f.trial * 7 + i * 31) % 130,
      (f.trial * 11 + i * 23) % 100,
    );
    if ((f.trial + i) % 3 === 0 || (f.trial + i) % 7 === 0) {
      n.Label = new Label();
      n.Label.Text = 'node';
      n.Label.Width = 18;
      n.Label.Height = 10;
      n.Label.Position =
        (f.trial + i) % 7 === 0
          ? Position.OutsideTopCenter
          : Position.InsideMiddleCenter;
    }
    if ((f.trial + i) % 13 === 0) n.IsInvisible = true;
    g.AddNewNodeToContainer(null, n);
  }
  for (let i = 0; i < 4; i++) {
    const e = g.Connect(g.Nodes[i]!, g.Nodes[(i + 2) % 5]!);
    const a = e.From.Center(),
      b = e.To.Center();
    e.Points = [
      a,
      new Point(a.X, b.Y + (f.trial % 15)),
      new Point(b.X, b.Y + (f.trial % 15)),
      b,
    ];
    if ((f.trial + i) % 3 === 0) {
      e.Label = new Label();
      e.Label.Text = 'edge';
      e.Label.Width = 16;
      e.Label.Height = 8;
      e.Label.Position = Position.InsideMiddleCenter;
      e.LabelPercentage = 0.5;
    }
    if ((f.trial + i) % 11 === 0) e.IsInvisible = true;
  }
  const [metrics, work] = inspectWithLimit(Background, g, 50_000_000n);
  expect(Number(work)).toBe(f.work);
  for (const key of [
    'NodeOverlaps',
    'RouteObstructions',
    'TextOcclusions',
    'Crossings',
    'Detour',
    'RouteLength',
  ] as const)
    expect(metrics[key]).toBeCloseTo(f.metrics[key], 10);
});
