import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { joinDistancedClusters } from '../src/tala/join-distanced-clusters.js';

interface Fixture {
  name: string;
  cellSize: number;
  nodes: { id: string; width: number; height: number; x: number; y: number; fixedTopLeft?: { x: number; y: number } }[];
  edges: { from: string; to: string; directed: boolean }[];
  positions: Record<string, { x: number; y: number }>;
}

const fixtures = JSON.parse(readFileSync(
  new URL('../tools/upstream-fixtures/join-expected.json', import.meta.url), 'utf8')) as Fixture[];

describe('ordinary distance-cluster join against pinned upstream TALA', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const graph = TalaGraph.fromFlowchart(
        fixture.nodes, fixture.edges.map((edge, index) => ({ id: String(index), ...edge })),
      );
      expect(graph.cellSize).toBe(fixture.cellSize);
      for (const input of fixture.nodes) {
        const node = graph.nodes.find((candidate) => candidate.id === input.id)!;
        node.topLeft = { x: input.x, y: input.y };
        node.fixedTopLeft = input.fixedTopLeft;
      }
      joinDistancedClusters(graph);
      for (const node of graph.nodes) {
        expect(node.topLeft!.x).toBeCloseTo(fixture.positions[node.id]!.x, 10);
        expect(node.topLeft!.y).toBeCloseTo(fixture.positions[node.id]!.y, 10);
      }
    });
  }
});
