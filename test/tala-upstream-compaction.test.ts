import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compactionCandidateMoves, inflateAlongAxis, visibilityEdges, type CompactionAxis } from '../src/tala/compaction.js';
import { compactOrdinaryGraph } from '../src/tala/compaction-search.js';
import { TalaGraph } from '../src/tala/graph.js';

interface Fixture {
  name: string;
  axis: CompactionAxis;
  includeSizes: boolean;
  transition: boolean;
  factor: number;
  full?: boolean;
  nodes: { id: string; width: number; height: number; x: number; y: number; fixed: boolean }[];
  edges: { from: string; to: string }[];
  cellSize: number;
  visibility: { from: string; to: string }[];
  candidates: Record<string, { x: number; y: number }[]>;
  inflated: Record<string, { x: number; y: number }>;
  compacted?: Record<string, { x: number; y: number }>;
  error?: string;
}

const fixtures = ['compaction-expected.json', 'compaction-random-expected.json',
  'compaction-full-expected.json', 'compaction-full-random-expected.json'].flatMap((file) =>
  JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8')) as Fixture[]);

describe('ordinary compaction primitives against pinned upstream TALA', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const graph = TalaGraph.fromFlowchart(
        fixture.nodes.map(({ id, width, height }) => ({ id, width, height })),
        fixture.edges.map((edge, index) => ({ id: String(index), ...edge, directed: false })),
      );
      fixture.nodes.forEach((input, index) => {
        const node = graph.nodes[index]!;
        node.topLeft = { x: input.x, y: input.y };
        if (input.fixed) node.fixedTopLeft = { ...node.topLeft };
      });
      expect(graph.cellSize).toBe(fixture.cellSize);
      const visible = visibilityEdges(graph, fixture.axis, fixture.includeSizes);
      expect(visible.map(({ from, to }) => ({ from: from.id, to: to.id }))).toEqual(fixture.visibility);
      for (const node of graph.nodes) {
        expect(compactionCandidateMoves(graph, node, fixture.axis, fixture.includeSizes,
          fixture.factor, visible)).toEqual(fixture.candidates[node.id]);
      }
      inflateAlongAxis(graph, fixture.axis, fixture.includeSizes, fixture.factor, visible, fixture.transition);
      for (const node of graph.nodes) expect(node.topLeft).toEqual(fixture.inflated[node.id]);
      if (fixture.full) {
        fixture.nodes.forEach((input, index) => { graph.nodes[index]!.topLeft = { x: input.x, y: input.y }; });
        const run = () => compactOrdinaryGraph(graph, { axis: fixture.axis, includeSizes: fixture.includeSizes,
          factor: fixture.factor, transition: fixture.transition });
        if (fixture.error) {
          expect(run).toThrow(fixture.error);
          fixture.nodes.forEach((input, index) => {
            expect(graph.nodes[index]!.topLeft).toEqual({ x: input.x, y: input.y });
          });
        }
        else {
          run();
          for (const node of graph.nodes) expect(node.topLeft).toEqual(fixture.compacted![node.id]);
        }
      }
    });
  }
});
