import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balanceRouteRanges } from '../src/tala/edge-balance-ranges.js';
import type { PositionedNode, PositionedEdge } from '../src/layout.js';

interface Case {
  name: string;
  nodes: Array<{ id: string; parentId?: string; X: number; Y: number;
    Width: number; Height: number }>;
  before: Array<{ id: string; from: string; to: string;
    points: Array<[number, number]> }>;
  after: Array<{ id: string; points: Array<[number, number]> }>;
}
const cases = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/balance-order-expected.json', import.meta.url),
'utf8')) as Case[];

describe('BalanceEdgeSegments preserves route order against Go', () => {
  for (const input of cases) it(input.name, () => {
    const nodes = input.nodes.map((node): PositionedNode => ({
      id: node.id, ...(node.parentId ? { parentId: node.parentId } : {}),
      x: node.X + node.Width / 2, y: node.Y + node.Height / 2,
      width: node.Width, height: node.Height,
    }));
    const edges = input.before.map((edge): PositionedEdge => ({
      id: edge.id, from: edge.from, to: edge.to,
      points: edge.points.map(([x, y]) => ({ x, y })), x: 0, y: 0,
    }));
    const balanced = balanceRouteRanges(nodes, edges);
    expect(balanced.map((edge) => ({ id: edge.id,
      points: edge.points.map((point): [number, number] => [point.x, point.y]) })))
      .toEqual(input.after.map((edge) => ({ id: edge.id, points: edge.points })));
  });
});
