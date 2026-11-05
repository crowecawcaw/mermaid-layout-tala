import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-labelingshared.json';
import { Point } from '../src/upstream/geo/point.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import {
  findSharedSegmentsChecked,
  scoreEdgeLabelOverlaps,
  scoreNodeLabelOverlaps,
} from '../src/upstream/labeling/shared-segments.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go shared label segments $trial', (f) => {
  const edges: Edge[] = [],
    starts = [0, 20, 80, 110, 180],
    lengths = [200, 30, 20, 50, 60];
  for (let i = 0; i < starts.length; i++) {
    const e = new Edge(new Node(1n, 10, 10), new Node(2n, 10, 10)),
      start = starts[i]! + (f.trial % 7),
      end = start + lengths[i]!;
    e.Points =
      f.trial % 2 === 0
        ? [new Point(start, 10), new Point(end, 10)]
        : [new Point(10, start), new Point(10, end)];
    if ((f.trial + i) % 3 === 0)
      [e.Points[0], e.Points[1]] = [e.Points[1]!, e.Points[0]!];
    edges.push(e);
  }
  let steps = 0;
  const segments = findSharedSegmentsChecked(edges, () => {
    steps++;
  });
  segments.sort((a, b) => a.Start.X - b.Start.X || a.Start.Y - b.Start.Y);
  compare(
    segments.map((s) => ({
      Start: { x: s.Start.X, y: s.Start.Y },
      End: { x: s.End.X, y: s.End.Y },
    })),
    f.segments,
  );
  expect(steps).toBe(f.steps);
  expect(
    scoreEdgeLabelOverlaps(
      100,
      25,
      f.trial % 3,
      f.trial % 5,
      f.trial % 7,
      f.trial % 4,
      f.trial % 2,
    ),
  ).toBe(f.edgeScore);
  expect(scoreNodeLabelOverlaps(f.trial % 3, f.trial % 5, f.trial % 4)).toBe(
    f.nodeScore,
  );
});
