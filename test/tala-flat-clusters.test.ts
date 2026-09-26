import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverFlatClusters } from '../src/tala/flat-clusters.js';
import { prescaleNodes } from '../src/tala/prescale.js';
import type { LayoutEdge, LayoutNode } from '../src/layout.js';

const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/flat-cluster-cases.json', import.meta.url), 'utf8')) as
  Array<{ name: string; seed: number; nodes: LayoutNode[]; edges: LayoutEdge[] }>;
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/flat-cluster-expected.json', import.meta.url), 'utf8')) as
  Array<{ name: string; remaining: string[]; clusters: unknown[] }>;

describe('upstream flat sibling clusters', () => {
  for (let index = 0; index < cases.length; index++) {
    it(`matches ${cases[index]!.name}`, () => {
      const input = cases[index]!;
      expect(expected[index]!.name).toBe(input.name);
      const actual = discoverFlatClusters(prescaleNodes(input.nodes, input.edges), input.edges, input.seed);
      expect(actual.clusters).toEqual(expected[index]!.clusters);
    });
  }
});
