import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { GoRandom } from '../src/tala/go-rng.js';
import { closestUnoccupiedDistance, medianToNeighbors, placementPoints, SizelessOptimizer } from '../src/tala/sizeless-optimizer.js';
import { sizelessNodeEdgeLength } from '../src/tala/sizeless-cost.js';

describe('TALA sizeless placement', () => {
  it('uses the median of positioned adjacent nodes', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' }], 'TB'
    );
    graph.nodes[1]!.topLeft = { x: 3, y: 5 };
    graph.nodes[2]!.topLeft = { x: 9, y: 11 };
    expect(medianToNeighbors(graph.nodes[0]!)).toEqual({ x: 6.25, y: 8.25 });
  });

  it('enumerates the upstream Manhattan rings', () => {
    const occupied = new Set(['0,0', '1,0', '0,1', '0,-1', '-1,0']);
    expect(closestUnoccupiedDistance({ x: 0, y: 0 }, occupied)).toBe(2);
    expect(placementPoints({ x: 0, y: 0 }, 0, new Set())).toEqual([
      { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -1 },
      { x: 0, y: 1 }, { x: -1, y: 0 },
    ]);
  });

  it('moves toward edge cost while preserving unique occupancy', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'TB'
    );
    graph.nodes[0]!.topLeft = { x: 0, y: 0 };
    graph.nodes[1]!.topLeft = { x: 8, y: 0 };
    const before = Math.abs(graph.nodes[0]!.topLeft.x - graph.nodes[1]!.topLeft.x);
    const score = (node: typeof graph.nodes[number]) => {
      const adjacent = node.adjacent(node.edges[0]!);
      return Math.abs(node.topLeft!.x - adjacent.topLeft!.x) + Math.abs(node.topLeft!.y - adjacent.topLeft!.y);
    };
    new SizelessOptimizer(graph, new GoRandom(1), score).optimize(0);
    expect(graph.nodes[0]!.topLeft).not.toEqual(graph.nodes[1]!.topLeft);
    expect(Math.abs(graph.nodes[0]!.topLeft!.x - graph.nodes[1]!.topLeft!.x)).toBeLessThan(before);
  });

  it('uses the ported edge score when no scorer is injected', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'LR'
    );
    graph.nodes[0]!.topLeft = { x: 0, y: 0 };
    graph.nodes[1]!.topLeft = { x: 8, y: 0 };
    const before = sizelessNodeEdgeLength(graph.nodes[0]!, graph);
    new SizelessOptimizer(graph, new GoRandom(1)).optimize(0);
    expect(sizelessNodeEdgeLength(graph.nodes[0]!, graph)).toBeLessThan(before);
    expect(graph.nodes[0]!.topLeft).not.toEqual(graph.nodes[1]!.topLeft);
  });

  it('does not move fixed anchors', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'TB'
    );
    graph.nodes[0]!.fixedTopLeft = { x: 0, y: 0 };
    graph.nodes[0]!.topLeft = { x: 0, y: 0 };
    graph.nodes[1]!.topLeft = { x: 4, y: 0 };
    const score = (node: typeof graph.nodes[number]) => Math.abs(node.topLeft!.x);
    new SizelessOptimizer(graph, new GoRandom(1), score).optimize(0);
    expect(graph.nodes[0]!.topLeft).toEqual({ x: 0, y: 0 });
  });

  it('rolls back all node positions when scoring fails', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }], 'TB'
    );
    graph.nodes.forEach((node, index) => { node.topLeft = { x: index * 5, y: 0 }; });
    const original = graph.nodes.map((node) => ({ ...node.topLeft! }));
    let calls = 0;
    const score = () => {
      if (++calls === 4) throw new Error('injected scoring failure');
      return calls;
    };
    const optimizer = new SizelessOptimizer(graph, new GoRandom(1), score);
    expect(() => optimizer.optimize(0)).toThrow('injected scoring failure');
    expect(graph.nodes.map((node) => node.topLeft)).toEqual(original);
  });
});
