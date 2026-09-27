import { describe, expect, it } from 'vitest';
import type { PositionedEdge, PositionedNode } from '../src/layout.js';
import { swapAllEdgePorts } from '../src/tala/swap-edge-ports.js';

const nodes: PositionedNode[] = [
  { id: 'n', x: 50, y: 50, width: 100, height: 100, rank: 0, order: 0 },
  { id: 'a', x: 250, y: -100, width: 100, height: 100, rank: 0, order: 0 },
  { id: 'b', x: 200, y: -215, width: 60, height: 70, rank: 0, order: 0 },
];
const route = (id: string, to: string, points: Array<[number, number]>): PositionedEdge => ({
  id, from: 'n', to, x: 0, y: 0, directed: true,
  points: points.map(([x, y]) => ({ x, y })),
});

describe('TALA adjacent-side port swaps', () => {
  it('matches Go when both split routes simplify', () => {
    const edges = [
      route('a', 'a', [[50, 0], [50, -50], [200, -50], [200, -100]]),
      route('b', 'b', [[100, 50], [150, 50], [150, -100], [200, -100], [200, -180]]),
    ];
    const result = swapAllEdgePorts(nodes, edges);
    expect(result[0]!.points).toEqual([
      { x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: -100 },
    ]);
    expect(result[1]!.points).toEqual([
      { x: 50, y: 0 }, { x: 50, y: -100 },
      { x: 200, y: -100 }, { x: 200, y: -180 },
    ]);
    expect(edges[0]!.points[0]).toEqual({ x: 50, y: 0 });
  });

  it('restores both routes when neither simplification helps', () => {
    const edges = [
      route('a', 'a', [[50, 0], [50, -50], [200, -50]]),
      route('b', 'b', [[100, 50], [150, 50], [150, -180]]),
    ];
    expect(swapAllEdgePorts(nodes, edges)).toEqual(edges);
  });

  it('matches Go when an adjacent swap opens a straight tunnel', () => {
    const tunnelNodes: PositionedNode[] = [nodes[0]!,
      { ...nodes[1]!, x: 130, y: -100 },
      { ...nodes[2]!, x: 150, y: -135 }];
    const edges = [
      route('a', 'a', [[50, 0], [50, -50], [160, -50]]),
      route('b', 'b', [[100, 50], [150, 50], [150, -100]]),
    ];
    const result = swapAllEdgePorts(tunnelNodes, edges);
    expect(result[0]!.points).toEqual([{ x: 85, y: 50 }, { x: 85, y: -50 }]);
    expect(result[1]!.points).toEqual([
      { x: 50, y: 0 }, { x: 50, y: -52.5 },
      { x: 150, y: -52.5 }, { x: 150, y: -100 },
    ]);
  });
});
