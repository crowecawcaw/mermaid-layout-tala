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

  it('anchors multiple fixed components on the compact grid', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c', 'd'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'cd', from: 'c', to: 'd' }], 'TB'
    );
    graph.nodes[0]!.fixedTopLeft = { x: 0, y: 0 };
    graph.nodes[2]!.fixedTopLeft = { x: 300, y: 0 };
    initializeNodes(graph);
    expect(graph.nodes[0]!.topLeft).toEqual({ x: 0, y: 0 });
    expect(graph.nodes[2]!.topLeft).toEqual({ x: Math.ceil(300 / (graph.cellSize * 3)), y: 0 });
    expect(graph.nodes.every((node) => node.topLeft)).toBe(true);
  });

  it('does not treat an undirected edge as an incoming arrow', () => {
    const dimensions = [[65, 55], [25, 30], [60, 25], [25, 25], [55, 20], [30, 40], [65, 50]];
    const graph = TalaGraph.fromFlowchart(
      'abcdefg'.split('').map((id, index) => ({ id, width: dimensions[index]![0]!, height: dimensions[index]![1]! })),
      [
        { id: 'ab', from: 'a', to: 'b', directed: false },
        { id: 'bc', from: 'b', to: 'c', directed: false },
        { id: 'ad', from: 'a', to: 'd', directed: false },
        { id: 'ae', from: 'a', to: 'e' },
        { id: 'bf', from: 'b', to: 'f' },
        { id: 'ag', from: 'a', to: 'g' },
        { id: 'bd', from: 'b', to: 'd', directed: false },
      ], 'BT',
    );
    initializeNodes(graph);
    expect(Object.fromEntries(graph.nodes.map((node) => [node.id, node.topLeft]))).toEqual({
      a: { x: 7, y: 7 }, b: { x: 7, y: 6 }, c: { x: 6, y: 6 },
      d: { x: 7, y: 5 }, e: { x: 8, y: 7 }, f: { x: 8, y: 6 }, g: { x: 6, y: 7 },
    });
  });
});
