import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { initializeNodes } from '../src/tala/initialize-nodes.js';

describe('TALA ordinary-node initialization', () => {
  it('places all nodes of a connected chain in direction order', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }], 'TB'
    );
    initializeNodes(graph);
    const [a, b, c] = graph.nodes.map((node) => node.topLeft!);
    expect(a).toEqual({ x: 3, y: 3 });
    expect(b!.y).toBeGreaterThan(a!.y);
    expect(c!.y).toBeGreaterThan(b!.y);
    expect(new Set(graph.nodes.map((node) => `${node.topLeft!.x},${node.topLeft!.y}`)).size).toBe(3);
  });

  it('rejects disconnected input until subgraph splitting is ported', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })), [], 'TB'
    );
    expect(() => initializeNodes(graph)).toThrow('connected component');
  });
});
