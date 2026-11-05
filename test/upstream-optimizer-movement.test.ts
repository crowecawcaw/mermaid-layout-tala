import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  optimizerDescendants,
  optimizerMoveNodeAbs,
} from '../src/upstream/placement/optimizer-movement.js';

it('moves descendants and restores shared point identities when work runs out', () => {
  const graph = new Graph(),
    parent = new Node(1n, 10, 10),
    child = new Node(2n, 10, 10);
  graph.AddNewNodeToContainer(null, parent);
  graph.AddNewNodeToContainer(parent, child);
  const a = new Point(0, 0),
    b = new Point(4, 5);
  parent.TopLeft = a;
  child.TopLeft = b;
  expect(
    optimizerDescendants(
      parent,
      new OptimizationWorkGuard(Background, 'test', 100n),
    ),
  ).toEqual([child]);
  expect(() =>
    optimizerMoveNodeAbs(
      parent,
      20,
      30,
      new OptimizationWorkGuard(Background, 'test', 3n),
    ),
  ).toThrow('work exceeds limit');
  expect(parent.TopLeft).toBe(a);
  expect(child.TopLeft).toBe(b);
  expect([a.X, a.Y, b.X, b.Y]).toEqual([0, 0, 4, 5]);
  optimizerMoveNodeAbs(
    parent,
    20,
    30,
    new OptimizationWorkGuard(Background, 'test', 100n),
  );
  expect([a.X, a.Y, b.X, b.Y]).toEqual([20, 30, 24, 35]);
});
