import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { doesOverlapAt, nodeDelta } from '../src/tala/overlap.js';

describe('TALA ordinary-node spacing', () => {
  it('requires the upstream connected and unconnected gaps', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'TB'
    );
    const [a, b, c] = graph.nodes;
    b!.topLeft = { x: 100, y: 0 };
    c!.topLeft = { x: 100, y: 0 };
    expect(nodeDelta(a!, b!)).toBe(60);
    expect(nodeDelta(a!, c!)).toBe(20);
    expect(doesOverlapAt(a!, b!, { x: 0, y: 0 })).toBe(false);
    expect(doesOverlapAt(a!, b!, { x: 1, y: 0 })).toBe(true);
    expect(doesOverlapAt(a!, c!, { x: 40, y: 0 })).toBe(false);
    expect(doesOverlapAt(a!, c!, { x: 41, y: 0 })).toBe(true);
  });
});
