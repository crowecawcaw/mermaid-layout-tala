import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractFlatTrees } from '../src/tala/tree-extraction.js';
import type { LayoutEdge, LayoutNode } from '../src/layout.js';

const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-cases.json', import.meta.url), 'utf8')) as
  Array<{ name: string; nodes: LayoutNode[]; edges: LayoutEdge[] }>;
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-extraction-expected.json', import.meta.url), 'utf8')) as
  Array<{ name: string; remaining: string[]; trees: unknown[] }>;

describe('upstream flat tree extraction', () => {
  for (let index = 0; index < cases.length; index++) {
    it(`matches generated tree ${index}`, () => {
      expect(cases[index]!.name).toBe(expected[index]!.name);
      expect(extractFlatTrees(cases[index]!.nodes, cases[index]!.edges)).toEqual({
        remaining: expected[index]!.remaining, trees: expected[index]!.trees,
      });
    });
  }
});
