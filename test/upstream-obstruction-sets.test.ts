import { expect, it } from 'vitest';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { obstructionSets } from '../src/upstream/placementcost/obstruction-sets.js';

it('visits each endpoint container up to the nearest shared ancestor without duplicates', () => {
  const graph = new Graph(),
    root = new Node(1n, 1, 1),
    left = new Node(2n, 1, 1),
    right = new Node(3n, 1, 1),
    a = new Node(4n, 1, 1),
    b = new Node(5n, 1, 1);
  graph.AddNewNodeToContainer(null, root);
  graph.AddNewNodeToContainer(root, left);
  graph.AddNewNodeToContainer(root, right);
  graph.AddNewNodeToContainer(left, a);
  graph.AddNewNodeToContainer(right, b);
  expect(obstructionSets(graph, a, b)).toEqual([[a], [b]]);
  expect(obstructionSets(graph, a, a)).toEqual([[a], [left, right], [root]]);
});
