import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LayoutDirection } from '../src/layout.js';
import { TalaGraph } from '../src/tala/graph.js';
import { placeOrdinaryNodes } from '../src/tala/ordinary-placement.js';

interface Fixture {
  name: string;
  seed: number;
  direction: string;
  nodes: { id: string; width: number; height: number }[];
  edges: { from: string; to: string; directed: boolean }[];
  cellSize: number;
  positions?: Record<string, { x: number; y: number }>;
  error?: string;
}

const fixtures = ['placement-expected.json', 'placement-random-expected.json'].flatMap((name) =>
  JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8')) as Fixture[]);

describe('ordinary placement stage against pinned upstream TALA', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const graph = TalaGraph.fromFlowchart(
        fixture.nodes, fixture.edges.map((edge, index) => ({ id: String(index), ...edge })),
        fixture.direction ? fixture.direction as LayoutDirection : undefined,
      );
      expect(graph.cellSize).toBe(fixture.cellSize);
      if (fixture.error) expect(() => placeOrdinaryNodes(graph, fixture.seed)).toThrow(fixture.error);
      else {
        placeOrdinaryNodes(graph, fixture.seed);
        for (const node of graph.nodes) expect(node.topLeft).toEqual(fixture.positions![node.id]);
      }
    }, 30000);
  }
});
