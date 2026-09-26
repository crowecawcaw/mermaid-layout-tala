import { describe, expect, it } from 'vitest';
import { GoRandom } from '../src/tala/go-rng.js';
import { TalaGraph } from '../src/tala/graph.js';
import { doesOverlapAt } from '../src/tala/overlap.js';
import { SizedOptimizer, sizedMedianToNeighbors } from '../src/tala/sized-optimizer.js';

describe('TALA ordinary-node sized placement', () => {
  it('matches upstream sized median fixture', () => {
    const graph = TalaGraph.fromFlowchart(
      ['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({ id, width: 50, height: 50 })),
      [
        { id: 'e1', from: 'n1', to: 'n5' }, { id: 'e2', from: 'n2', to: 'n5' },
        { id: 'e3', from: 'n3', to: 'n5' }, { id: 'e4', from: 'n4', to: 'n5' },
      ], 'TB'
    );
    const positions = [[100, 0], [0, 100], [200, 100], [100, 200], [0, 0]];
    graph.nodes.forEach((node, index) => { node.topLeft = { x: positions[index]![0]!, y: positions[index]![1]! }; });
    const target = graph.nodes[4]!;
    expect(sizedMedianToNeighbors(target, graph)).toEqual({ x: 2.5, y: 2.5 });
    expect(new SizedOptimizer(graph, new GoRandom(1), () => 0).medianPoint(target, 0))
      .toEqual({ x: 125, y: 125 });
  });

  it('chooses the best legal box placement and protects connected-node gaps', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }], 'LR'
    );
    const [a, b] = graph.nodes;
    a!.topLeft = { x: 0, y: 0 };
    b!.topLeft = { x: 300, y: 0 };
    const optimizer = new SizedOptimizer(graph, new GoRandom(1),
      (node) => Math.abs(node.topLeft!.x - node.adjacent(node.edges[0]!).topLeft!.x));
    expect(optimizer.moveNodeToBest(a!, [
      { x: 240, y: 0 }, { x: 200, y: 0 }, { x: 160, y: 0 },
    ], true)).toBe(true);
    expect(a!.topLeft).toEqual({ x: 200, y: 0 });
    expect(doesOverlapAt(a!, b!, a!.topLeft!)).toBe(false);
  });

  it('uses the upstream fixture to reject padded overlaps', () => {
    const graph = TalaGraph.fromFlowchart(
      ['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({ id, width: 50, height: 50 })),
      [
        { id: 'e1', from: 'n1', to: 'n5' }, { id: 'e2', from: 'n2', to: 'n5' },
        { id: 'e3', from: 'n3', to: 'n5' }, { id: 'e4', from: 'n4', to: 'n5' },
      ], 'TB'
    );
    const positions = [[100, 0], [0, 100], [200, 100], [100, 200], [0, 0]];
    graph.nodes.forEach((node, index) => { node.topLeft = { x: positions[index]![0]!, y: positions[index]![1]! }; });
    const target = graph.nodes[4]!;
    const score = (node: typeof target) => node.edges.reduce((sum, edge) => {
      const other = node.adjacent(edge);
      return sum + Math.hypot(node.topLeft!.x - other.topLeft!.x, node.topLeft!.y - other.topLeft!.y);
    }, 0);
    const optimizer = new SizedOptimizer(graph, new GoRandom(1), score);
    expect(optimizer.moveNodeToBest(target, [{ x: 0, y: 0 }, { x: 100, y: 100 }], false)).toBe(false);
    expect(optimizer.moveNodeToBest(target, [
      { x: 300, y: 200 }, { x: 400, y: 200 }, { x: 350, y: 200 },
    ], false)).toBe(true);
    expect(target.topLeft).toEqual({ x: 350, y: 200 });
  });

  it('restores positions if a sized scoring pass throws', () => {
    const graph = TalaGraph.fromFlowchart(
      ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 20 })),
      [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }], 'TB'
    );
    graph.nodes.forEach((node, index) => { node.topLeft = { x: index * 200, y: 0 }; });
    const original = graph.nodes.map((node) => ({ ...node.topLeft! }));
    let calls = 0;
    const optimizer = new SizedOptimizer(graph, new GoRandom(1), () => {
      if (++calls === 3) throw new Error('scoring failure');
      return calls;
    });
    expect(() => optimizer.optimize(0)).toThrow('scoring failure');
    expect(graph.nodes.map((node) => node.topLeft)).toEqual(original);
  });
});
