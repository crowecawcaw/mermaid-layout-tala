import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { sizelessNodeEdgeLength } from '../src/tala/sizeless-cost.js';

describe('TALA sizeless ordinary-node edge cost', () => {
  it('penalizes reversing the requested direction', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'TB'
    );
    const [a, b] = graph.nodes;
    a!.topLeft = { x: 0, y: 0 };
    b!.topLeft = { x: 0, y: 2 };
    const forward = sizelessNodeEdgeLength(a!, graph);
    b!.topLeft = { x: 0, y: -2 };
    const reversed = sizelessNodeEdgeLength(a!, graph);
    expect(forward).toBe(2);
    expect(reversed).toBe(3.5);
  });
});
