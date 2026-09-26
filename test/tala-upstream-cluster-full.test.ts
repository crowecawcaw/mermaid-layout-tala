import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge, type LayoutNode } from '../src/layout.js';

const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/flat-cluster-cases.json', import.meta.url), 'utf8')) as
  Array<{ name: string; direction: LayoutDirection; seed: number; nodes: LayoutNode[]; edges: LayoutEdge[] }>;
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/flat-cluster-full-expected.json', import.meta.url), 'utf8')) as
  Array<{ name: string; nodes: Array<{ id: string; x: number; y: number; width: number; height: number }> }>;

describe('upstream clustered graph geometry', () => {
  for (const index of [0, 1]) {
    it(`matches ${cases[index]!.name}`, () => {
      const input = cases[index]!, output = expected[index]!;
      expect(output.name).toBe(input.name);
      const result = layoutFlowchart(input.nodes, input.edges, {
        direction: input.direction, strategy: 'tala', seeds: [input.seed],
      });
      const anchor = output.nodes[0]!;
      const placedAnchor = result.nodes.find((node) => node.id === anchor.id)!;
      for (const node of output.nodes) {
        const placed = result.nodes.find((candidate) => candidate.id === node.id)!;
        expect(placed.width).toBe(node.width);
        expect(placed.height).toBe(node.height);
        expect(placed.x - placed.width / 2 - placedAnchor.x + placedAnchor.width / 2).toBe(node.x - anchor.x);
        expect(placed.y - placed.height / 2 - placedAnchor.y + placedAnchor.height / 2).toBe(node.y - anchor.y);
      }
    });
  }
});
