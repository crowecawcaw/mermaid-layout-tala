import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { placeOrdinaryNodes } from '../src/tala/ordinary-placement.js';
import { directOrdinaryGraph } from '../src/tala/direct.js';
import { nodeSymmetry } from '../src/tala/symmetry.js';

function projectedGraph(): TalaGraph {
  const graph = TalaGraph.fromFlowchart([
    { id: 'Group', width: 470, height: 155, isGroup: true },
    { id: 'X', width: 70, height: 35 },
    { id: 'Y', width: 70, height: 35 },
  ], [
    { id: 'ax', from: 'Group', to: 'X', directed: true },
    { id: 'cx', from: 'Group', to: 'X', directed: true },
    { id: 'cy', from: 'Group', to: 'Y', directed: true },
  ], 'LR');
  for (const [edgeId, childId, offsetX] of [
    ['ax', 'A', 60], ['cx', 'C', 340], ['cy', 'C', 340],
  ] as const) {
    graph.edgeEndpointReplacements.set(edgeId, { from: {
      original: { id: childId, width: 70, height: 35, parentId: 'Group' },
      proxyId: 'Group', offsetX, offsetY: 60,
    } });
  }
  graph.projectedChildren.set('Group', ([['A', 60], ['B', 200], ['C', 340]] as const)
    .map(([id, offsetX]) => ({ original: { id, width: 70, height: 35,
      parentId: 'Group' }, offsetX, offsetY: 60 })));
  return graph;
}

describe('upstream projected compound placement', () => {
  it('matches the complete root placement stage for three boundary edges', () => {
    const graph = projectedGraph();
    placeOrdinaryNodes(graph, 2);
    directOrdinaryGraph(graph, 'LR');
    const origin = graph.nodes[0]!.topLeft!;
    expect(graph.nodes.map((node) => [node.id, node.topLeft!.x - origin.x,
      node.topLeft!.y - origin.y, node.width, node.height])).toEqual([
      ['Group', 0, 0, 470, 155], ['X', 106, 226, 70, 35],
      ['Y', 530, 67, 70, 35],
    ]);
  });

  it('sees original child endpoints through an abducted edge when scoring symmetry', () => {
    const graph = projectedGraph();
    graph.nodes[0]!.topLeft = { x: -212, y: 212 };
    graph.nodes[1]!.topLeft = { x: 0, y: 106 };
    graph.nodes[2]!.topLeft = { x: 106, y: 106 };
    expect(nodeSymmetry(graph.nodes[1]!, graph)).toBe(0.25);
  });
});
