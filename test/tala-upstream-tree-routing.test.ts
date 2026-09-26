import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalTreePath } from '../src/tala/tree-routing.js';
import { layoutFlowchart, type LayoutDirection, type PositionedNode } from '../src/layout.js';

interface Case {
  name: string;
  direction: LayoutDirection;
  seed: number;
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; from: string; to: string; directed: boolean }>;
}
interface Expected {
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
}
const read = (name: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('full-tree-random-cases.json') as Case[];
const expected = read('full-tree-random-expected.json') as Expected[];
const extraction = read('full-tree-random-extraction-expected.json') as Array<{ remaining: string[] }>;

describe('upstream center-port tree routes', () => {
  for (const [index, input] of cases.entries()) {
    const root = input.nodes.find((node) => !input.edges.some((edge) => edge.to === node.id))?.id;
    if (extraction[index]!.remaining.length !== 1 || extraction[index]!.remaining[0] !== root) continue;
    it(`matches all routes in ${input.name}`, () => {
      const output = expected[index]!;
      const byId = new Map(output.nodes.map((node) => [node.id, {
        ...node, x: node.x + node.width / 2, y: node.y + node.height / 2,
      } as PositionedNode]));
      for (const edge of input.edges) {
        expect(canonicalTreePath(byId.get(edge.from)!, byId.get(edge.to)!, input.direction))
          .toEqual(output.edges.find((candidate) => candidate.id === edge.id)!.points);
      }
    });
  }
  for (const index of [0, 1, 5, 7, 9, 10, 11, 15, 18, 23]) {
    it(`uses upstream routes in the completed layout of ${cases[index]!.name}`, () => {
      const input = cases[index]!, output = expected[index]!;
      const placed = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const actualFirst = placed.nodes.find((node) => node.id === output.nodes[0]!.id)!;
      const dx = actualFirst.x - actualFirst.width / 2 - output.nodes[0]!.x;
      const dy = actualFirst.y - actualFirst.height / 2 - output.nodes[0]!.y;
      for (const edge of output.edges) {
        expect(placed.edges.find((candidate) => candidate.id === edge.id)!.points)
          .toEqual(edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })));
      }
    });
  }
});
