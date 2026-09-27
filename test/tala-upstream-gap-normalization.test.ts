import { describe, expect, it } from 'vitest';
import { normalizeGaps } from '../src/tala/gap-normalization.js';
import { TalaGraph } from '../src/tala/graph.js';

describe('placement.NormalizeGaps against upstream compound stage', () => {
  for (const scenario of [
    { direction: 'TB' as const, inputY: 4, outputY: 342,
      beforeY: 178, afterY: 174 },
    { direction: 'BT' as const, inputY: 346, outputY: 0,
      beforeY: 178, afterY: 181 },
  ]) {
    it(`pulls a child toward its padded container wall in ${scenario.direction}`, () => {
      const graph = TalaGraph.fromFlowchart([
        { id: 'Group', width: 318, height: 159, isGroup: true },
        { id: 'N0', width: 58, height: 32, parentId: 'Group' },
        { id: 'N1', width: 70, height: 39, parentId: 'Group' },
        { id: 'Input', width: 75, height: 43 },
        { id: 'Output', width: 82, height: 38 },
      ], [
        { id: 'entry', from: 'Input', to: 'N0', directed: true },
        { id: 'chain1', from: 'N0', to: 'N1', directed: true },
        { id: 'exit', from: 'N1', to: 'Output', directed: true },
      ], scenario.direction);
      const before = new Map([
        ['Group', { x: -11, y: 114 }],
        ['N0', { x: 49, y: scenario.beforeY }],
        ['N1', { x: 177, y: 174 }],
        ['Input', { x: 40, y: scenario.inputY }],
        ['Output', { x: 171, y: scenario.outputY }],
      ]);
      for (const node of graph.nodes) node.topLeft = before.get(node.id)!;
      expect(normalizeGaps(graph)).toBe(true);
      expect(graph.nodes.map((node) => [node.id, node.topLeft!.x, node.topLeft!.y]))
        .toEqual([['Group', -11, 114], ['N0', 49, scenario.afterY],
          ['N1', 177, 174], ['Input', 40, scenario.inputY],
          ['Output', 171, scenario.outputY]]);
    });
  }

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
