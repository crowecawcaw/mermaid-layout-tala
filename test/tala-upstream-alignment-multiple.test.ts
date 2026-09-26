import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { alignAxesPass } from '../src/tala/alignment-search.js';
import { ordinaryPlacementEdgeLength } from '../src/tala/placement-edge-length.js';
import { containerAlignmentCost } from '../src/tala/container-alignment-cost.js';

describe('upstream multiple boundary alignment stage', () => {
  const makeGraph = (positions: Record<string, [number, number]>) => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Group', width: 470, height: 155, isGroup: true },
      { id: 'A', width: 70, height: 35, parentId: 'Group' },
      { id: 'B', width: 70, height: 35, parentId: 'Group' },
      { id: 'C', width: 70, height: 35, parentId: 'Group' },
      { id: 'X', width: 70, height: 35 },
      { id: 'Y', width: 70, height: 35 },
    ], [
      { id: 'ab', from: 'A', to: 'B', directed: true },
      { id: 'bc', from: 'B', to: 'C', directed: true },
      { id: 'ax', from: 'A', to: 'X', directed: true },
      { id: 'cx', from: 'C', to: 'X', directed: true },
      { id: 'cy', from: 'C', to: 'Y', directed: true },
    ], 'LR');
    for (const node of graph.nodes) {
      const [x, y] = positions[node.id]!;
      node.topLeft = { x, y };
    }
    return graph;
  };
  const score = (candidate: TalaGraph) => ordinaryPlacementEdgeLength(candidate)
    + containerAlignmentCost(candidate);

  it('matches the stage 09 to 10 geometry', () => {
    const graph = makeGraph({ Group: [0, 0], A: [60, 60], B: [200, 60],
      C: [340, 60], X: [106, 226], Y: [530, 67] });
    expect(alignAxesPass(graph, score)).toBe(true);
    expect(graph.nodes.map((node) => [node.id, node.topLeft, node.width, node.height]))
      .toEqual([
        ['Group', { x: -234, y: 7 }, 470, 155],
        ['A', { x: -174, y: 67 }, 70, 35],
        ['B', { x: -34, y: 67 }, 70, 35],
        ['C', { x: 106, y: 67 }, 70, 35],
        ['X', { x: 106, y: 233 }, 70, 35],
        ['Y', { x: 296, y: 67 }, 70, 35],
      ]);
  });

  it('matches the stage 16 to 17 second container translation', () => {
    const graph = makeGraph({ Group: [-234, 7], A: [-174, 67], B: [-34, 67],
      C: [106, 67], X: [-34, 233], Y: [296, 67] });
    expect(alignAxesPass(graph, score)).toBe(true);
    expect(graph.nodes.map((node) => [node.id, node.topLeft])).toEqual([
      ['Group', { x: -374, y: 7 }], ['A', { x: -314, y: 67 }],
      ['B', { x: -174, y: 67 }], ['C', { x: -34, y: 67 }],
      ['X', { x: -34, y: 233 }], ['Y', { x: 156, y: 67 }],
    ]);
  });
});
