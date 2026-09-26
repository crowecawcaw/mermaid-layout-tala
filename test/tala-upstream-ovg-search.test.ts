import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchFlatOVGSingleEdge } from '../src/tala/ovg-search.js';
import type { OVGFlatNode } from '../src/tala/ovg-build.js';

interface Case { name: string; nodes: OVGFlatNode[] }
interface Output { name: string; points: [number, number][]; cost: number; error?: string }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-candidate-cases.json') as Case[];
const expected = read('ovg-search-expected.json') as Output[];

describe('pinned upstream ordinary OVG search', () => {
  for (const input of cases) {
    it(input.name, () => {
      const result = searchFlatOVGSingleEdge(input.nodes,
        input.nodes[0]!.id, input.nodes[1]!.id);
      const oracle = expected.find((item) => item.name === input.name)!;
      expect(result.points.map(({ x, y }) => [x, y])).toEqual(oracle.points);
      expect(result.cost).toBeCloseTo(oracle.cost, 7);
    });
  }
});
