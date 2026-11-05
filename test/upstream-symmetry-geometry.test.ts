import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  isMirrored,
  obstructed,
} from '../src/upstream/placementcost/symmetry-geometry.js';

it('requires mirror gaps around the axis and detects obstructions', () => {
  const graph = new Graph(),
    center = new Node(1n, 10, 10),
    a = new Node(2n, 10, 10),
    b = new Node(3n, 10, 10),
    obstacle = new Node(4n, 4, 4);
  graph.CellSize = 1;
  for (const n of [center, a, b, obstacle]) graph.AddNodeUnchecked(n);
  center.TopLeft = new Point(0, 0);
  a.TopLeft = new Point(-30, 0);
  b.TopLeft = new Point(30, 0);
  obstacle.TopLeft = new Point(20, 3);
  expect(isMirrored(a, b, true, 5)).toBe(true);
  expect(isMirrored(a, b, true, 15)).toBe(false);
  expect(obstructed(Background, center, a, b, [obstacle], [])).toBe(true);
  obstacle.Container = center;
  expect(obstructed(Background, center, a, b, [obstacle], [])).toBe(false);
});
