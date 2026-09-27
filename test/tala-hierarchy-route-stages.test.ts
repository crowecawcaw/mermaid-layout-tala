import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeGraphEdges } from '../src/route.js';
import { balanceRouteRanges } from '../src/tala/edge-balance-ranges.js';
import { swapAllEdgePorts } from '../src/tala/swap-edge-ports.js';
import { nudgeEdgeChannels } from '../src/tala/nudge-channels.js';
import { dejitterTreeRoutes } from '../src/tala/dejitter.js';
import type { LayoutDirection, LayoutEdge, PositionedNode } from '../src/layout.js';

const read = (name: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('hierarchy-generated-cases.json') as Array<{ name: string;
  direction: LayoutDirection; edges: LayoutEdge[] }>;
const expected = read('hierarchy-route-stages-expected.json') as Array<{ name: string;
  stages: Array<{ index: number; nodes: Record<string, [number, number, number, number]>;
    levels: Record<string, number>; edges: Record<string, Array<[number, number]>> }> }>;
const mixedCases = read('hierarchy-mixed-cases.json') as typeof cases;
const mixedExpected = read('hierarchy-mixed-route-stages-expected.json') as typeof expected;

describe('hierarchy route stages against Go', () => {
  for (const input of mixedCases) it(`${input.name} mixed swaps same-side ports`, () => {
    const oracle = mixedExpected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 25)!;
    const after = oracle.stages.find((stage) => stage.index === 26)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: before.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = swapAllEdgePorts(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(after.edges[edge.id]);
  });
  for (const input of mixedCases) it(`${input.name} mixed balances all routes`, () => {
    const oracle = mixedExpected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 27)!;
    const after = oracle.stages.find((stage) => stage.index === 28)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: before.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = balanceRouteRanges(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(after.edges[edge.id]);
  });
  for (const input of mixedCases) it(`${input.name} mixed Dejitter node placement`, () => {
    const oracle = mixedExpected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 21)!;
    const after = oracle.stages.find((stage) => stage.index === 23)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: before.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    dejitterTreeRoutes(nodes, edges, new Set(nodes.map((node) => node.id)));
    for (const node of nodes) expect([node.x - node.width / 2, node.y - node.height / 2,
      node.width, node.height]).toEqual(after.nodes[node.id]);
  });
  for (const input of mixedCases) it(`${input.name} mixed initial OVG routes`, () => {
    const oracle = mixedExpected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 20)!;
    const routed = oracle.stages.find((stage) => stage.index === 21)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const actual = routeGraphEdges(nodes, input.edges, input.direction,
      new Map(), true, new Map(Object.entries(before.levels)));
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(routed.edges[edge.id]);
  });
  for (const input of mixedCases) it(`${input.name} mixed routes nudge edge channels`, () => {
    const oracle = mixedExpected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 31)!;
    const after = oracle.stages.find((stage) => stage.index === 34)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: before.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = nudgeEdgeChannels(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(after.edges[edge.id]);
  });
  for (const input of cases) it(`${input.name} nudges edge channels`, () => {
    const oracle = expected.find((item) => item.name === input.name)!;
    const before = oracle.stages.find((stage) => stage.index === 31)!;
    const after = oracle.stages.find((stage) => stage.index === 34)!;
    const nodes: PositionedNode[] = Object.entries(before.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: before.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: before.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = nudgeEdgeChannels(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(after.edges[edge.id]);
  });
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

  for (const input of cases) it(`${input.name} swaps same-side ports`, () => {
    const oracle = expected.find((item) => item.name === input.name)!;
    const routed = oracle.stages.find((stage) => stage.index === 25)!;
    const swapped = oracle.stages.find((stage) => stage.index === 26)!;
    const nodes: PositionedNode[] = Object.entries(routed.nodes).map(([id,
      [x, y, width, height]]) => ({ id, x: x + width / 2, y: y + height / 2,
      width, height, rank: routed.levels[id]!, order: 0 }));
    const edges = input.edges.map((edge) => ({ ...edge, points: routed.edges[edge.id]!
      .map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = swapAllEdgePorts(nodes, edges);
    for (const edge of input.edges) expect(actual.find((item) => item.id === edge.id)!.points
      .map((point) => [point.x, point.y])).toEqual(swapped.edges[edge.id]);
  });

  for (const input of cases) it(`${input.name} balances all routes`, () => {
    const oracle = expected.find((item) => item.name === input.name)!;
    const routed = oracle.stages.find((stage) => stage.index === 27)!;
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
