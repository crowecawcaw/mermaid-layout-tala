import { expect, it } from 'vitest';
import { placeFlatClusters } from '../src/tala/flat-cluster-placement.js';

it('keeps an undirected container interior at the upstream node-placement stage', () => {
  // Upstream container-diamond stage 07: A/B/D share one row; C is below B.
  // Later AlignAxes centers A and D against the two cluster members.
  const nodes = ['A', 'B', 'C', 'D'].map((id) => ({ id, width: 70, height: 35 }));
  const edges = [['ab', 'A', 'B'], ['ac', 'A', 'C'], ['bd', 'B', 'D'], ['cd', 'C', 'D']]
    .map(([id, from, to]) => ({ id: id!, from: from!, to: to!, directed: true }));
  const ranks = new Map([['A', 0], ['B', 1], ['C', 1], ['D', 2]]);
  const placed = placeFlatClusters(nodes, edges, 'LR', 1, ranks, false)!;
  const minX = Math.min(...placed.map((node) => node.x - node.width / 2));
  const minY = Math.min(...placed.map((node) => node.y - node.height / 2));
  expect(placed.map((node) => ({ id: node.id, x: node.x - node.width / 2 - minX,
    y: node.y - node.height / 2 - minY }))).toEqual([
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 180, y: 0 },
    { id: 'C', x: 180, y: 55 },
    { id: 'D', x: 360, y: 0 },
  ]);
});
