import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutNode } from '../src/layout.js';
import { TalaGraph } from '../src/tala/graph.js';
import { nodeSymmetry } from '../src/tala/symmetry.js';

describe('projected child symmetry', () => {
  it('scores the original child topology during parent placement', () => {
    const children: LayoutNode[] = [
      { id: 'N0', parentId: 'Group', width: 58, height: 32 },
      { id: 'N1', parentId: 'Group', width: 70, height: 39 },
      { id: 'N2', parentId: 'Group', width: 82, height: 32 },
    ];
    const originalEdges: LayoutEdge[] = [
      { id: 'entry', from: 'Input', to: 'N0' },
      { id: 'chain1', from: 'N0', to: 'N1' },
      { id: 'chain2', from: 'N1', to: 'N2' },
      { id: 'exit', from: 'N2', to: 'Output' },
      { id: 'bypass', from: 'N0', to: 'Output' },
    ];
    const graph = TalaGraph.fromFlowchart([
      { id: 'Group', width: 436, height: 159, isGroup: true },
      { id: 'Input', width: 75, height: 43 },
      { id: 'Output', width: 82, height: 38 },
    ], [
      { id: 'entry', from: 'Input', to: 'Group' },
      { id: 'exit', from: 'Group', to: 'Output' },
      { id: 'bypass', from: 'Group', to: 'Output' },
    ], 'TB');
    const [group, input, output] = graph.nodes;
    group!.topLeft = { x: 342, y: 0 };
    input!.topLeft = { x: 456, y: -114 };
    output!.topLeft = { x: 456, y: 228 };
    graph.projectedChildren.set('Group', children.map((original, index) => ({
      original, offsetX: [60, 306, 142][index]!, offsetY: 60,
    })));
    graph.edgeEndpointReplacements.set('entry', {
      to: { original: children[0]!, proxyId: 'Group', offsetX: 60, offsetY: 60 },
    });
    graph.originalSymmetryEdges = originalEdges;

    expect(nodeSymmetry(input!, graph)).toBeCloseTo(2 / 3);
    input!.topLeft = { x: 399, y: -114 };
    expect(nodeSymmetry(input!, graph)).toBe(0);
  });
});
