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
  nears?: [string, string][];
  commonUncleGroups?: string[][];
  emptyAbductions?: boolean;
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
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      for (const [a, b] of fixture.nears ?? []) {
        byId.get(a)!.nears.add(byId.get(b)!);
        byId.get(b)!.nears.add(byId.get(a)!);
      }
      for (const group of fixture.commonUncleGroups ?? []) {
        const siblings = group.map((id) => byId.get(id)!);
        for (const node of siblings) graph.commonUncleSiblings.set(node, siblings);
      }
      if (fixture.error) expect(() => placeOrdinaryNodes(graph, fixture.seed,
        undefined, fixture.emptyAbductions)).toThrow(fixture.error);
      else {
        placeOrdinaryNodes(graph, fixture.seed, undefined, fixture.emptyAbductions);
        for (const node of graph.nodes) expect(node.topLeft).toEqual(fixture.positions![node.id]);
      }
    }, 30000);
  }
});
