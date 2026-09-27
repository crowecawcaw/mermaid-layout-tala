import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeGraphEdges } from '../src/route.js';
import { balanceRouteRanges } from '../src/tala/edge-balance-ranges.js';
import type { LayoutDirection, LayoutEdge, PositionedNode } from '../src/layout.js';

const read = (name: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('hierarchy-generated-cases.json') as Array<{ name: string;
  direction: LayoutDirection; edges: LayoutEdge[] }>;
const expected = read('hierarchy-route-stages-expected.json') as Array<{ name: string;
  stages: Array<{ index: number; nodes: Record<string, [number, number, number, number]>;
    levels: Record<string, number>; edges: Record<string, Array<[number, number]>> }> }>;

describe('hierarchy route stages against Go', () => {
  for (const input of cases) it(`${input.name} initial OVG routes`, () => {
    const oracle = expected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 20)!;
    const routed = oracle.stages.find((stage) => stage.index === 21)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const levels = new Map(Object.entries(before.levels));
    const actual = routeGraphEdges(nodes, input.edges, input.direction, new Map(), true, levels);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(routed.edges[edge.id]);
  });

  for (const name of ['layered-1', 'layered-2', 'layered-3', 'layered-4',
    'layered-6', 'layered-7', 'layered-8', 'layered-9', 'layered-10']) it(`${name} balances all routes`, () => {
    const input = cases.find((item) => item.name === name)!;
    const oracle = expected.find((item) => item.name === name)!;
    const routed = oracle.stages.find((stage) => stage.index === 24)!;
    const balanced = oracle.stages.find((stage) => stage.index === 28)!;
    const nodes: PositionedNode[] = Object.entries(routed.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: routed.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: routed.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = balanceRouteRanges(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(balanced.edges[edge.id]);
  });
});
