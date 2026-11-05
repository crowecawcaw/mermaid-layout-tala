import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-labelingsort.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import {
  LabelPlacementWorkGuard,
  sortLabelPlacementEdges,
} from '../src/upstream/labeling/guard.js';
it.each(fixtures)('matches Go label edge ordering $trial', (f) => {
  const edges: Edge[] = [];
  for (let i = 0; i < 7; i++) {
    const e = new Edge(new Node(1n, 10, 10), new Node(2n, 10, 10));
    e.ID = BigInt(i + 1);
    const length = 50 + ((i * 43 + f.trial * 13) % 180);
    e.Points = [new Point(0, 0), new Point(length, 0)];
    if ((i + f.trial) % 3 === 0)
      e.Points = [new Point(0, 0), new Point(length, 0), new Point(length, 20)];
    edges.push(e);
  }
  const guard = new LabelPlacementWorkGuard(Background, 'PlaceLabels', 100000n),
    sorted = sortLabelPlacementEdges(edges, guard);
  expect({
    ids: sorted.map((e) => Number(e.ID)),
    work: Number(guard.used),
  }).toEqual({ ids: f.ids, work: f.work });
});
