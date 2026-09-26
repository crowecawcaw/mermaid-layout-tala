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
interface Expected {
  name: string;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}
const inputs = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-layout-cases.json', import.meta.url), 'utf8')) as Case[];
const outputs = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-layout-expected.json', import.meta.url), 'utf8')) as Expected[];
const exactCases = new Set([
  'chain-tb', 'diamond-lr', 'star-tb', 'star-lr', 'star-bt', 'star-rl',
  'star-uneven', 'two-level-tree', 'cycle-rl', 'two-components',
]);

describe('completed upstream graph geometry', () => {
  for (const [index, input] of inputs.entries()) {
    if (!exactCases.has(input.name)) continue;
    it(`${input.name} matches relative node positions and sizes`, () => {
      const output = outputs[index]!;
      expect(output.name).toBe(input.name);
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const reference = output.nodes[0]!;
      const actualReference = result.nodes.find((node) => node.id === reference.id)!;
      for (const node of output.nodes) {
        const actual = result.nodes.find((candidate) => candidate.id === node.id)!;
        expect(actual.width).toBe(node.width);
        expect(actual.height).toBe(node.height);
        expect(actual.x - actual.width / 2 - actualReference.x + actualReference.width / 2).toBe(node.x - reference.x);
        expect(actual.y - actual.height / 2 - actualReference.y + actualReference.height / 2).toBe(node.y - reference.y);
      }
    });
  }
});
