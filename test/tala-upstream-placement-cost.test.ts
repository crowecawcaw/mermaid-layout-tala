import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LayoutDirection } from '../src/layout.js';
import { TalaGraph } from '../src/tala/graph.js';
import { sizelessNodeEdgeLength } from '../src/tala/sizeless-cost.js';
import { sizedNodeEdgeLength, sizedTurnCost } from '../src/tala/sized-cost.js';
import { nodeSymmetry } from '../src/tala/symmetry.js';

interface Fixture {
  name: string;
  direction: string;
  nodes: { id: string; width: number; height: number; x: number; y: number }[];
  edges: { from: string; to: string; directed: boolean }[];
  cellSize: number;
  turnCost: number;
  results: { id: string; sizelessCost: number; sizedCost: number; symmetry: number }[];
}

const fixtures = ['expected.json', 'random-expected.json'].flatMap((file) =>
  JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8')) as Fixture[]);

describe('ordinary-node placement cost against pinned upstream TALA', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const graph = TalaGraph.fromFlowchart(
        fixture.nodes.map(({ id, width, height }) => ({ id, width, height })),
        fixture.edges.map((edge, index) => ({ id: String(index), ...edge })),
        fixture.direction ? fixture.direction as LayoutDirection : undefined,
      );
      fixture.nodes.forEach((input, index) => {
        graph.nodes[index]!.topLeft = { x: input.x, y: input.y };
      });
      expect(graph.cellSize).toBe(fixture.cellSize);
      expect(sizedTurnCost(graph)).toBeCloseTo(fixture.turnCost, 9);
      for (const expected of fixture.results) {
        const node = graph.nodes.find((candidate) => candidate.id === expected.id)!;
        expect(sizelessNodeEdgeLength(node, graph)).toBeCloseTo(expected.sizelessCost, 9);
        expect(sizedNodeEdgeLength(node, graph)).toBeCloseTo(expected.sizedCost, 9);
        expect(nodeSymmetry(node, graph)).toBeCloseTo(expected.symmetry, 9);
      }
    });
  }
});
