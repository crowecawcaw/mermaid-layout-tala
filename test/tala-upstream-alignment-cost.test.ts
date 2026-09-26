import { describe, expect, it } from 'vitest';
import { alignAxesPass } from '../src/tala/alignment-search.js';
import { containerAlignmentCost } from '../src/tala/container-alignment-cost.js';
import { TalaGraph } from '../src/tala/graph.js';
import { ordinaryPlacementEdgeLength } from '../src/tala/placement-edge-length.js';

// Values printed by alignment-cost-oracle_test.go against pinned upstream D2.
describe('compound alignment cost against upstream stage trace', () => {
  it('matches the complete graph-level score and chosen move', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 360, height: 160, isGroup: true },
      { id: 'A', width: 80, height: 40, parentId: 'G' },
      { id: 'B', width: 80, height: 40, parentId: 'G' },
      { id: 'X', width: 80, height: 40 },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bx', from: 'B', to: 'X' },
    ], 'TB');
    for (const [index, topLeft] of [
      { x: 0, y: 0 }, { x: 60, y: 60 },
      { x: 220, y: 60 }, { x: 240, y: 240 },
    ].entries()) graph.nodes[index]!.topLeft = topLeft;
    const score = (candidate: TalaGraph) => ordinaryPlacementEdgeLength(candidate)
      + containerAlignmentCost(candidate);
    expect(score(graph)).toBeCloseTo(453.5125, 9);
    expect(alignAxesPass(graph, score)).toBe(true);
    expect(graph.nodes.map((node) => node.topLeft)).toEqual([
      { x: 20, y: 0 }, { x: 80, y: 60 },
      { x: 240, y: 60 }, { x: 240, y: 240 },
    ]);
    expect(score(graph)).toBeCloseTo(453.5, 9);
  });
});
