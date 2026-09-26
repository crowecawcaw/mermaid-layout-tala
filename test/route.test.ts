import { describe, expect, it } from 'vitest';
import { routeGraphEdges } from '../src/route.js';
import type { PositionedNode } from '../src/layout.js';

function node(id: string, x: number, y: number, width = 60, height = 40, parentId?: string): PositionedNode {
  return { id, x, y, width, height, rank: 0, order: 0, ...(parentId ? { parentId } : {}) };
}

describe('orthogonal graph router', () => {
  it('routes around a blocking node', () => {
    const nodes = [node('source', 0, 0), node('blocker', 150, 0, 90, 90), node('target', 300, 0)];
    const [route] = routeGraphEdges(nodes, [{ id: 'edge', from: 'source', to: 'target' }], 'LR');
    expect(route).toBeDefined();
    expect(route!.points.some((point) => Math.abs(point.y) >= 57)).toBe(true);
    expect(crossesInterior(route!.points, nodes[1]!)).toBe(false);
    expect(route!.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it('can leave an ancestor container but avoids unrelated containers', () => {
    const nodes = [
      { ...node('sourceGroup', 0, 0, 160, 150), isGroup: true },
      node('source', 0, 0, 60, 40, 'sourceGroup'),
      { ...node('blockGroup', 180, 0, 100, 120), isGroup: true },
      node('target', 360, 0),
    ];
    const [route] = routeGraphEdges(nodes, [{ id: 'edge', from: 'source', to: 'target' }], 'LR');
    expect(route).toBeDefined();
    expect(crossesInterior(route!.points, nodes[2]!)).toBe(false);
    expect(route!.points[0]!.x).toBe(30);
  });
});

function crossesInterior(points: readonly { x: number; y: number }[], obstacle: PositionedNode): boolean {
  const left = obstacle.x - obstacle.width / 2;
  const right = obstacle.x + obstacle.width / 2;
  const top = obstacle.y - obstacle.height / 2;
  const bottom = obstacle.y + obstacle.height / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (a.y === b.y && a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right) return true;
    if (a.x === b.x && a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom) return true;
  }
  return false;
}
