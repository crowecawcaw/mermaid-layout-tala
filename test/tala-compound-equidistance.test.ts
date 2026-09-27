import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { equidistance } from '../src/tala/equidistance.js';

describe('compound equidistance', () => {
  it('matches Go stage 16 when a child and its container are moved together', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Group', width: 436, height: 159, isGroup: true },
      { id: 'N0', parentId: 'Group', width: 58, height: 32 },
      { id: 'N1', parentId: 'Group', width: 70, height: 39 },
      { id: 'N2', parentId: 'Group', width: 82, height: 32 },
      { id: 'Input', width: 75, height: 43 },
      { id: 'Output', width: 82, height: 38 },
    ], [
      { id: 'entry', from: 'Input', to: 'N0' },
      { id: 'chain1', from: 'N0', to: 'N1' },
      { id: 'chain2', from: 'N1', to: 'N2' },
      { id: 'exit', from: 'N2', to: 'Output' },
      { id: 'bypass', from: 'N0', to: 'Output' },
    ], 'TB');
    const before: Record<string, [number, number]> = {
      Group: [0, 106], N0: [166, 170], N1: [306, 166],
      N2: [60, 173], Input: [158, 0], Output: [101, 334],
    };
    for (const node of graph.nodes) {
      const [x, y] = before[node.id]!;
      node.topLeft = { x, y };
    }

    expect(equidistance(graph)).toBe(true);
    expect(Object.fromEntries(graph.nodes.map((node) => [node.id,
      [node.topLeft!.x, node.topLeft!.y]]))).toEqual({
      Group: [0, 112], N0: [166, 173], N1: [306, 172],
      N2: [60, 179], Input: [158, 0], Output: [101, 334],
    });
  });
});
