import { describe, expect, it } from 'vitest';
import { avoidObstacles, crossesBox, routeMidpoint } from '../src/routing.js';
import { layoutFlowchart, type PositionedNode } from '../src/layout.js';

const node = (id: string, x: number, y: number): PositionedNode => ({ id, x, y, width: 40, height: 40, rank: 0, order: 0 });
describe('obstacle routing', () => {
  it('routes a long edge around an intervening node', () => {
    const a = node('a', 0, 0), b = node('b', 0, 200), obstacle = node('obstacle', 0, 100);
    const route = avoidObstacles([{ x: 0, y: 20 }, { x: 0, y: 180 }], a, b, [a, b, obstacle]);
    expect(route.some((p) => Math.abs(p.x) >= 20)).toBe(true);
    for (let i = 1; i < route.length; i++) {
      expect(crossesBox(route[i - 1]!, route[i]!, { left: -20, right: 20, top: 80, bottom: 120 })).toBe(false);
    }
    expect(avoidObstacles([{ x: 0, y: 20 }, { x: 0, y: 180 }], a, b, [obstacle, b, a])).toEqual(route);
  });

  it('places the label at half the path length, not the middle vertex', () => {
    expect(routeMidpoint([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 90, y: 10 }])).toEqual({ x: 40, y: 10 });
  });

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('keeps shortcut and feedback edges outside node interiors in %s', (direction) => {
    const result = layoutFlowchart(['a', 'b', 'c'].map((id) => ({ id, width: 80, height: 40 })), [
      { id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' },
      { id: 'ac', from: 'a', to: 'c' }, { id: 'ca', from: 'c', to: 'a' },
    ], { direction });
    for (const edge of result.edges) for (const n of result.nodes) for (let i = 1; i < edge.points.length; i++) {
      expect(crossesBox(edge.points[i - 1]!, edge.points[i]!, {
        left: n.x - n.width / 2, right: n.x + n.width / 2, top: n.y - n.height / 2, bottom: n.y + n.height / 2,
      })).toBe(false);
    }
  });
});
