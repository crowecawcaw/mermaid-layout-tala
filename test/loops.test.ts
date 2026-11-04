import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-loops.json';
import { prescaleNodes, routeLoops } from '../src/loops.js';
import { layoutFlowchart } from '../src/layout.js';

describe('upstream rectangular self loops', () => {
  it.each(fixtures)('matches exact Go ports and routes for $name', (fixture) => {
    expect(Object.fromEntries(routeLoops(fixture.node, fixture.edges))).toEqual(fixture.expected);
  });
  it('reserves distinct tracks for equal-arrowhead loops', () => {
    const result = layoutFlowchart(
      [{ id: 'n', width: 60, height: 30 }],
      Array.from({ length: 8 }, (_, i) => ({ id: String(i), from: 'n', to: 'n' }))
    );
    expect(new Set(result.edges.map((e) => JSON.stringify(e.points))).size).toBe(8);
    expect(result.nodes[0]!.height).toBe(40);
    expect(result.edges.every((e) => e.points.every((p) => p.x >= 0 && p.y >= 0))).toBe(true);
  });
  it.each(['TB', 'BT', 'LR', 'RL'] as const)(
    'keeps nested loop tracks within their group in %s',
    (direction) => {
      const result = layoutFlowchart(
        [
          { id: 'g', isGroup: true, width: 80, height: 40 },
          { id: 'n', parentId: 'g', width: 60, height: 30 },
        ],
        Array.from({ length: 4 }, (_, i) => ({ id: String(i), from: 'n', to: 'n' })),
        { direction }
      );
      const group = result.nodes.find((n) => n.id === 'g')!;
      for (const edge of result.edges)
        for (const point of edge.points) {
          expect(point.x).toBeGreaterThanOrEqual(group.x - group.width / 2);
          expect(point.x).toBeLessThanOrEqual(group.x + group.width / 2);
          expect(point.y).toBeGreaterThanOrEqual(group.y - group.height / 2);
          expect(point.y).toBeLessThanOrEqual(group.y + group.height / 2);
        }
    }
  );
  it('prescales dense parallel edges but honors fixedSize', () => {
    const nodes = [
      { id: 'a', width: 60, height: 30 },
      { id: 'b', width: 60, height: 30, fixedSize: true },
    ];
    const edges = Array.from({ length: 3 }, (_, i) => ({ id: String(i), from: 'a', to: 'b' }));
    prescaleNodes(nodes, edges);
    expect(nodes[0]).toMatchObject({ width: 160, height: 160 });
    expect(nodes[1]).toMatchObject({ width: 60, height: 30 });
  });
});
