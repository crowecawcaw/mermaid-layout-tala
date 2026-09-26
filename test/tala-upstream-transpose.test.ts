import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { transposeLeaves } from '../src/tala/transpose.js';

describe('pinned upstream TransposeAll stage', () => {
  it('rotates a nested leaf branch and refits its containers', () => {
    // NodePlacement output from nested-container-stage-trace.txt at upstream
    // bf337903. TransposeAll moves Database around Service at stage 09.
    const nodes = [
      { id: 'Cloud', width: 450, height: 395, isGroup: true, x: 0, y: 106 },
      { id: 'API', width: 330, height: 155, isGroup: true, parentId: 'Cloud', x: 60, y: 166 },
      { id: 'Gateway', width: 70, height: 35, parentId: 'API', x: 120, y: 226 },
      { id: 'Service', width: 70, height: 35, parentId: 'API', x: 260, y: 226 },
      { id: 'Database', width: 80, height: 50, parentId: 'Cloud', x: 285, y: 391 },
      { id: 'Client', width: 70, height: 35, x: 106, y: 0 },
    ];
    const graph = TalaGraph.fromFlowchart(nodes, [
      { id: 'cg', from: 'Client', to: 'Gateway', directed: true },
      { id: 'gs', from: 'Gateway', to: 'Service', directed: true },
      { id: 'sd', from: 'Service', to: 'Database', directed: true },
    ], 'TB');
    for (const node of graph.nodes) {
      const input = nodes.find((item) => item.id === node.id)!;
      node.topLeft = { x: input.x, y: input.y };
    }
    expect(transposeLeaves(graph)).toBe(true);
    expect(graph.nodes.map((node) => ({ id: node.id, x: node.topLeft!.x,
      y: node.topLeft!.y, width: node.width, height: node.height }))).toEqual([
      { id: 'Cloud', x: 0, y: 106, width: 567, height: 275 },
      { id: 'API', x: 60, y: 166, width: 330, height: 155 },
      { id: 'Gateway', x: 120, y: 226, width: 70, height: 35 },
      { id: 'Service', x: 260, y: 226, width: 70, height: 35 },
      { id: 'Database', x: 427, y: 189, width: 80, height: 50 },
      { id: 'Client', x: 106, y: 0, width: 70, height: 35 },
    ]);
  });
});
