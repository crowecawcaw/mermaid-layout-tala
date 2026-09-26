import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection } from '../src/layout.js';

interface Case {
  name: string;
  direction: LayoutDirection;
  seed: number;
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; from: string; to: string; directed: boolean }>;
}
interface Result {
  name: string;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}
const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-cases.json', import.meta.url), 'utf8')) as Case[];
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-stage-expected.json', import.meta.url), 'utf8')) as Result[];
const exact = new Set([0, 1, 4, 5, 7, 8, 9, 10, 11, 15, 16, 20, 23]);

describe('upstream tree placement stage', () => {
  for (const index of exact) {
    it(`matches generated tree ${index} before routing refinements`, () => {
      const input = cases[index]!;
      const output = expected[index]!;
      expect(output.name).toBe(input.name);
      const placed = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const first = output.nodes[0]!;
      const placedFirst = placed.nodes.find((node) => node.id === first.id)!;
      for (const node of output.nodes) {
        const actual = placed.nodes.find((candidate) => candidate.id === node.id)!;
        expect(actual.width).toBe(node.width);
        expect(actual.height).toBe(node.height);
        expect(actual.x - actual.width / 2 - placedFirst.x + placedFirst.width / 2).toBe(node.x - first.x);
        expect(actual.y - actual.height / 2 - placedFirst.y + placedFirst.height / 2).toBe(node.y - first.y);
      }
    });
  }
});
