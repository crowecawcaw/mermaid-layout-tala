import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { HerdAssignment } from '../src/upstream/layoutgraph/records.js';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { captureOptimizerMutationState } from '../src/upstream/placement/optimizer-snapshot.js';

it('restores node geometry, herd values and placement cache identity', () => {
  const g = new Graph(),
    n = new Node(1n, 10, 20),
    p = new Point(3, 4),
    herd = new HerdAssignment();
  g.AddNewNodeToContainer(null, n);
  n.TopLeft = p;
  n.HerdAssignment = herd;
  herd.Val = 9;
  g.edgeLengthCache!.set(1n, 42);
  const cache = g.edgeLengthCache,
    guard = new OptimizationWorkGuard(Background, 'test', 100n);
  const saved = captureOptimizerMutationState(g, guard);
  n.TopLeft = new Point(99, 99);
  p.X = 77;
  n.Width = 55;
  herd.Val = 88;
  g.edgeLengthCache!.set(2n, 99);
  g.turnCost = 7;
  saved.restore();
  expect(n.TopLeft).toBe(p);
  expect([p.X, p.Y, n.Width, n.Height, herd.Val]).toEqual([3, 4, 10, 20, 9]);
  expect(g.edgeLengthCache).toBe(cache);
  expect([...cache!]).toEqual([[1n, 42]]);
  expect(g.turnCost).toBe(0);
});
