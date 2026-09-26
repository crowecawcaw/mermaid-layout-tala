import { describe, expect, it } from 'vitest';
import { normalizeGaps } from '../src/tala/gap-normalization.js';
import { TalaGraph } from '../src/tala/graph.js';

describe('placement.NormalizeGaps against upstream compound stage', () => {
  it('reduces the external gap while recovering the inner sibling spacing', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Left', width: 330, height: 155, isGroup: true },
      { id: 'A', width: 70, height: 35, parentId: 'Left' },
      { id: 'B', width: 70, height: 35, parentId: 'Left' },
      { id: 'Right', width: 330, height: 155, isGroup: true },
      { id: 'C', width: 70, height: 35, parentId: 'Right' },
      { id: 'D', width: 70, height: 35, parentId: 'Right' },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bc', from: 'B', to: 'C' },
      { id: 'cd', from: 'C', to: 'D' },
    ], 'LR');
    for (const [index, point] of [
      { x: 0, y: 0 }, { x: 60, y: 60 }, { x: 200, y: 60 },
      { x: 660, y: 0 }, { x: 720, y: 60 }, { x: 860, y: 60 },
    ].entries()) graph.nodes[index]!.topLeft = point;
    expect(graph.cellSize).toBe(53);
    expect(normalizeGaps(graph)).toBe(true);
    expect(graph.nodes.map((node) => ({ id: node.id, ...node.topLeft,
      width: node.width, height: node.height }))).toEqual([
      { id: 'Left', x: 180, y: 0, width: 330, height: 155 },
      { id: 'A', x: 240, y: 60, width: 70, height: 35 },
      { id: 'B', x: 380, y: 60, width: 70, height: 35 },
      { id: 'Right', x: 660, y: 0, width: 410, height: 155 },
      { id: 'C', x: 720, y: 60, width: 70, height: 35 },
      { id: 'D', x: 940, y: 60, width: 70, height: 35 },
    ]);
  });
});
