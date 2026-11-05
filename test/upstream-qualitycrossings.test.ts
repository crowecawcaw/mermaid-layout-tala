import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-qualitycrossings.json';
import { Background } from '../src/upstream/limits/context.js';
import { WorkGuard } from '../src/upstream/limits/work.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { countNonSharedCrossings } from '../src/upstream/quality/crossings.js';

it.each(fixtures)('matches Go quality crossings $trial', (f) => {
  const g = new Graph();
  for (let i = 0; i < 5; i++) {
    const n = new Node(BigInt(2 * i + 1), 10, 10);
    const m = new Node(BigInt(2 * i + 2), 10, 10);
    g.AddNewNodeToContainer(null, n);
    g.AddNewNodeToContainer(null, m);
    const edge = g.Connect(n, m);
    for (let j = 0; j < (f.trial + i) % 5; j++)
      edge.Points.push(
        new Point(
          (f.trial + i * 17 + j * 13) % 70,
          (f.trial * 3 + i * 23 + j * 11) % 70,
        ),
      );
  }
  const guard = new WorkGuard(Background, 'quality crossings', 10000n);
  expect({
    count: countNonSharedCrossings(g.Edges, guard),
    work: Number(guard.Used()),
  }).toEqual({ count: f.count, work: f.work });
});
