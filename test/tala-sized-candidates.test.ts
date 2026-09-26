import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { closestSizedUnoccupiedDistance, iterPlacementsAroundPoint, roundToNearestCellSize, sizedPlacementPoints } from '../src/tala/sized-candidates.js';

describe('TALA sized placement candidates', () => {
  it('matches upstream nearest-cell rounding and size-aware placements', () => {
    expect(roundToNearestCellSize(-5, 10)).toBe(-10);
    expect(roundToNearestCellSize(5, 10)).toBe(10);
    const graph = TalaGraph.fromFlowchart([{ id: 'n', width: 10, height: 10 }], [], 'TB');
    graph.cellSize = 2;
    const points: Array<[number, number]> = [];
    iterPlacementsAroundPoint(graph.nodes[0]!, 2, 5, 5, true, (x, y) => {
      points.push([x, y]);
      return false;
    });
    expect(points).toContainEqual([0, 0]);
    expect(points).toContainEqual([10, 10]);
    expect(points).toContainEqual([6, 0]);
    expect(points).toHaveLength(36);
  });

  it('matches the upstream sized-optimizer ring fixture', () => {
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
    expect(graph.cellSize).toBe(50);
    expect(closestSizedUnoccupiedDistance(graph, target, { x: 0, y: 0 }, true)).toBe(0);
    expect(closestSizedUnoccupiedDistance(graph, target, { x: 100, y: 100 }, true)).toBe(4);
    expect(closestSizedUnoccupiedDistance(graph, target, { x: 100, y: 200 }, true)).toBe(3);
    const candidates = sizedPlacementPoints(graph, target, { x: 100, y: 100 }, 0, true);
    expect(candidates.length).toBeGreaterThan(5);
    expect(new Set(candidates.map((point) => `${point.x},${point.y}`)).size).toBe(candidates.length);
    expect(sizedPlacementPoints(graph, target, { x: 100, y: 100 }, 1, true)).toHaveLength(24);
  });
});
