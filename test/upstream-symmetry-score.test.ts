import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Background } from '../src/upstream/limits/context.js';
import { computeSymmetryScoreInto } from '../src/upstream/placementcost/symmetry-score.js';

it('matches mirrored neighbors once and rejects obstructed pairs', () => {
  const g = new Graph(),
    center = new Node(1n, 10, 10),
    a = new Node(2n, 10, 10),
    b = new Node(3n, 10, 10),
    obstacle = new Node(4n, 4, 4);
  g.CellSize = 1;
  for (const n of [center, a, b]) g.AddNewNodeToContainer(null, n);
  center.TopLeft = new Point(0, 0);
  a.TopLeft = new Point(-30, 0);
  b.TopLeft = new Point(30, 0);
  obstacle.TopLeft = new Point(20, 3);
  const matched = [true, true];
  expect(computeSymmetryScoreInto(Background, center, [a, b], matched)).toBe(2);
  expect(matched).toEqual([true, true]);
  g.AddNewNodeToContainer(null, obstacle);
  expect(computeSymmetryScoreInto(Background, center, [a, b], matched)).toBe(0);
  expect(matched).toEqual([false, false]);
});
