import { expect, it } from 'vitest';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { withHubSpokesSuppressed } from '../src/upstream/placement/sized-kernels.js';

it('removes one incident edge per spoke and restores the original slice after failure', () => {
  const g = new Graph(),
    hub = new Node(1n, 1, 1),
    a = new Node(2n, 1, 1),
    b = new Node(3n, 1, 1);
  for (const n of [hub, a, b]) g.AddNodeUnchecked(n);
  const first = g.Connect(hub, a),
    second = g.Connect(hub, a),
    third = g.Connect(hub, b),
    original = hub.Edges;
  expect(() =>
    withHubSpokesSuppressed(
      hub,
      [a],
      new OptimizationWorkGuard(Background, 'test', 100n),
      () => {
        expect(hub.Edges).toEqual([second, third]);
        throw new Error('failure');
      },
    ),
  ).toThrow('failure');
  expect(hub.Edges).toBe(original);
  expect(hub.Edges).toEqual([first, second, third]);
});
