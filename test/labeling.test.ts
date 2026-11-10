import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';

describe('measured edge labels', () => {
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('reserves space and separates parallel labels in %s', (direction) => {
    const nodes = [{ id: 'a', width: 80, height: 40 }, { id: 'b', width: 80, height: 40 }];
    const edges = ['one', 'two', 'three'].map((id) => ({ id, from: 'a', to: 'b', labelWidth: 160, labelHeight: 48 }));
    const result = layoutFlowchart(nodes, edges, { direction, rankSpacing: 0, inputOrder: 'canonical' });
    const boxes = [...result.nodes];
    for (const edge of result.edges) {
      for (const box of boxes) {
        expect(Math.abs(edge.x - box.x) >= (160 + box.width) / 2
          || Math.abs(edge.y - box.y) >= (48 + box.height) / 2).toBe(true);
      }
      boxes.push({ id: edge.id, x: edge.x, y: edge.y, width: 160, height: 48, rank: 0, order: 0 });
    }
    expect(layoutFlowchart([...nodes].reverse(), [...edges].reverse(), { direction, rankSpacing: 0, inputOrder: 'canonical' })).toEqual(result);
  });

  it('rejects invalid label geometry and nonfinite ordering passes', () => {
    const nodes = [{ id: 'a', width: 20, height: 20 }];
    expect(() => layoutFlowchart(nodes, [{ id: 'loop', from: 'a', to: 'a', labelWidth: NaN }])).toThrow(/labelWidth/);
    expect(() => layoutFlowchart(nodes, [], { orderingPasses: Infinity })).toThrow(/orderingPasses/);
  });
});
