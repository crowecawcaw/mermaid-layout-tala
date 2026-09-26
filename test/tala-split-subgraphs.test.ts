import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { splitOrdinarySubgraphs } from '../src/tala/split-subgraphs.js';

describe('TALA ordinary subgraph splitting', () => {
  it('keeps BFS node order and original edge order within each component', () => {
    const graph = TalaGraph.fromFlowchart(
      ['b', 'a', 'c', 'd', 'e'].map((id) => ({ id, width: 40, height: 20 })),
      [
        { id: 'ac', from: 'a', to: 'c' }, { id: 'bd', from: 'b', to: 'd' },
        { id: 'ba', from: 'b', to: 'a' },
      ], 'LR'
    );
    const parts = splitOrdinarySubgraphs(graph);
    expect(parts.map((part) => part.nodes.map((node) => node.id))).toEqual([['b', 'd', 'a', 'c'], ['e']]);
    expect(parts.map((part) => part.edges.map((edge) => edge.id))).toEqual([['ac', 'bd', 'ba'], []]);
    expect(parts[0]!.nodes[0]).toBe(graph.nodes[0]);
    expect(parts[0]!.directions.get(null)).toBe('LR');
  });

  it('returns no components for an empty graph', () => {
    expect(splitOrdinarySubgraphs(TalaGraph.fromFlowchart([], [], 'TB'))).toEqual([]);
  });

  it('puts disconnected fixed nodes in the first subgraph', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c', 'd'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'cd', from: 'c', to: 'd' }], 'TB'
    );
    graph.nodes[0]!.fixedTopLeft = { x: 0, y: 0 };
    graph.nodes[2]!.fixedTopLeft = { x: 200, y: 0 };
    expect(splitOrdinarySubgraphs(graph).map((part) => part.nodes.map((node) => node.id))).toEqual([['a', 'b', 'c', 'd']]);
  });
});
