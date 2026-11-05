import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-routinggeometry.json';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import {
  segmentIntersectsBox,
  orientation,
  intersects,
} from '../src/upstream/routing/geometry.js';
import { idealTurnAxes } from '../src/upstream/routing/turns.js';
import {
  nonParallelIntersection,
  countNonSharedCrossings,
  estimateRouteCost,
} from '../src/upstream/routing/cost.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go routing geometry and scoring $trial', (f) => {
  const p = f.points.map((v) => new Point(v.x, v.y));
  const box = new Box(
    new Point(f.box.TopLeft.x, f.box.TopLeft.y),
    f.box.Width,
    f.box.Height,
  );
  const a = new Node(1n, f.aWidth, f.aHeight),
    b = new Node(2n, f.bWidth, f.bHeight);
  a.TopLeft = p[0]!;
  b.TopLeft = p[1]!;
  const e = new Edge(a, b),
    other = new Edge(a, b);
  e.Points = p.slice(0, 4);
  other.Points = p.slice(4);
  compare(
    {
      box: segmentIntersectsBox(p[0]!, p[1]!, box),
      orientation: orientation(p[0]!, p[1]!, p[2]!),
      intersection: intersects(p[0]!, p[1]!, p[2]!, p[3]!),
      nonparallel: nonParallelIntersection(p[0]!, p[1]!, p[2]!, p[3]!),
      axes: idealTurnAxes(a, b),
      crossings: countNonSharedCrossings(e, other),
      cost: estimateRouteCost([e, other], e),
    },
    f.expected,
  );
});
it('handles absent segment inputs', () => {
  expect(segmentIntersectsBox(null, new Point(0, 0), null)).toBe(false);
});
