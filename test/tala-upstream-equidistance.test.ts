import { describe, expect, it } from 'vitest';
import { equidistance } from '../src/tala/equidistance.js';
import { TalaGraph } from '../src/tala/graph.js';

// Coordinates from the pinned upstream two-container stage trace, after
// GapNormalization and after Equidistance.
describe('placement.Equidistance against upstream compound stage', () => {
  it('centers linked children and refits both containers', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Left', width: 330, height: 155, isGroup: true },
      { id: 'A', width: 70, height: 35, parentId: 'Left' },
      { id: 'B', width: 70, height: 35, parentId: 'Left' },
      { id: 'Right', width: 410, height: 155, isGroup: true },
      { id: 'C', width: 70, height: 35, parentId: 'Right' },
      { id: 'D', width: 70, height: 35, parentId: 'Right' },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bc', from: 'B', to: 'C' },
      { id: 'cd', from: 'C', to: 'D' },
    ], 'LR');
    for (const [index, point] of [
      { x: 180, y: 0 }, { x: 240, y: 60 }, { x: 380, y: 60 },
      { x: 660, y: 0 }, { x: 720, y: 60 }, { x: 940, y: 60 },
    ].entries()) graph.nodes[index]!.topLeft = point;
    expect(equidistance(graph)).toBe(true);
    expect(graph.nodes.map((node) => ({ id: node.id, ...node.topLeft,
      width: node.width, height: node.height }))).toEqual([
      { id: 'Left', x: 180, y: 0, width: 404, height: 155 },
      { id: 'A', x: 240, y: 60, width: 70, height: 35 },
      { id: 'B', x: 454, y: 60, width: 70, height: 35 },
      { id: 'Right', x: 667, y: 0, width: 403, height: 155 },
      { id: 'C', x: 727, y: 60, width: 70, height: 35 },
      { id: 'D', x: 940, y: 60, width: 70, height: 35 },
    ]);
  });
});
