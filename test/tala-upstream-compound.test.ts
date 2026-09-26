import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge, type LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Expected { name: string; nodes: Array<{ id: string; x: number; y: number;
  width: number; height: number }> }
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
});
