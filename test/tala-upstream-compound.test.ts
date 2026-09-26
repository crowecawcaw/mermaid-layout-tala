import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge, type LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Expected { name: string; nodes: Array<{ id: string; x: number; y: number;
  width: number; height: number }>; edges: Array<{ id: string; points: Array<{ x: number; y: number }> }> }
const read = (name: string) => JSON.parse(readFileSync(
  new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('compound-layout-cases.json') as Case[];
const expected = read('compound-layout-expected.json') as Expected[];

describe('pinned upstream compound-layout interiors', () => {
  for (const [caseName, interior] of [
    ['one-container-chain', ['G', 'A', 'B']],
    ['directioned-container', ['Group', 'A', 'B', 'C']],
  ] as const) {
    it(caseName, () => {
      const input = cases.find((item) => item.name === caseName)!;
      const oracle = expected.find((item) => item.name === caseName)!;
      const actual = layoutFlowchart(input.nodes, input.edges,
        { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
      const byId = new Map(actual.nodes.map((node) => [node.id, node]));
      expect(interior.map((id) => {
        const node = byId.get(id)!;
        return { id, x: node.x - node.width / 2, y: node.y - node.height / 2,
          width: node.width, height: node.height };
      })).toEqual(oracle.nodes.filter((node) => (interior as readonly string[]).includes(node.id)));
    });
  }

  it('aligns the external endpoint on the upstream axis', () => {
    const input = cases.find((item) => item.name === 'one-container-chain')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const outside = actual.nodes.find((node) => node.id === 'X')!;
    expect(outside.x - outside.width / 2)
      .toBe(oracle.nodes.find((node) => node.id === 'X')!.x);
  });

  it('aligns the directioned container output vertically with its last child', () => {
    const input = cases.find((item) => item.name === 'directioned-container')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const outside = actual.nodes.find((node) => node.id === 'Outside')!;
    expect(outside.y - outside.height / 2)
      .toBe(oracle.nodes.find((node) => node.id === 'Outside')!.y);
  });

  it('matches complete upstream geometry and routes for one-container chain', () => {
    const input = cases.find((item) => item.name === 'one-container-chain')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const byId = new Map(actual.nodes.map((node) => [node.id, node]));
    expect(oracle.nodes.map(({ id }) => byId.get(id)!).map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
    expect(actual.edges.map((edge) => ({ id: edge.id, points: edge.points })))
      .toEqual(oracle.edges);
  });

  it('matches all upstream node positions for the directioned container', () => {
    const input = cases.find((item) => item.name === 'directioned-container')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const byId = new Map(actual.nodes.map((node) => [node.id, node]));
    expect(oracle.nodes.map(({ id }) => byId.get(id)!).map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
  });

  it('matches all upstream node positions and sizes for linked containers', () => {
    const input = cases.find((item) => item.name === 'two-container-links')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const byId = new Map(actual.nodes.map((node) => [node.id, node]));
    expect(oracle.nodes.map(({ id }) => byId.get(id)!).map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
  });

  it('matches all upstream node positions and sizes for nested containers', () => {
    const input = cases.find((item) => item.name === 'nested-container')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const byId = new Map(actual.nodes.map((node) => [node.id, node]));
    expect(oracle.nodes.map(({ id }) => byId.get(id)!).map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
    expect(actual.edges.find((edge) => edge.id === 'cg')!.points)
      .toEqual(oracle.edges.find((edge) => edge.id === 'cg')!.points);
  });
});
