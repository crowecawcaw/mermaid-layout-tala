import { expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { balanceSymmetry } from '../src/tala/balance-symmetry.js';

it('matches upstream BalanceSymmetry after alignment for multiple boundary edges', () => {
  // Stage 14 to 15 of multiple-boundary-stage-trace.txt at upstream bf337903.
  const nodes = [
    { id: 'Group', width: 470, height: 155, isGroup: true, x: -234, y: 7 },
    { id: 'A', width: 70, height: 35, parentId: 'Group', x: -174, y: 67 },
    { id: 'B', width: 70, height: 35, parentId: 'Group', x: -34, y: 67 },
    { id: 'C', width: 70, height: 35, parentId: 'Group', x: 106, y: 67 },
    { id: 'X', width: 70, height: 35, x: 106, y: 233 },
    { id: 'Y', width: 70, height: 35, x: 296, y: 67 },
  ];
  const graph = TalaGraph.fromFlowchart(nodes, [
    { id: 'ab', from: 'A', to: 'B', directed: true },
    { id: 'bc', from: 'B', to: 'C', directed: true },
    { id: 'ax', from: 'A', to: 'X', directed: true },
    { id: 'cx', from: 'C', to: 'X', directed: true },
    { id: 'cy', from: 'C', to: 'Y', directed: true },
  ], 'LR');
  for (const node of graph.nodes) {
    const input = nodes.find((item) => item.id === node.id)!;
    node.topLeft = { x: input.x, y: input.y };
  }
  expect(balanceSymmetry(graph)).toBe(true);
  expect(graph.nodes.map((node) => [node.id, node.topLeft!.x, node.topLeft!.y]))
    .toEqual([
      ['Group', -234, 7], ['A', -174, 67], ['B', -34, 67],
      ['C', 106, 67], ['X', -34, 233], ['Y', 296, 67],
    ]);
});
