import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LayoutDirection } from '../src/layout.js';
import { placeSimpleTree } from '../src/tala/simple-tree.js';
import { prescaleNodes } from '../src/tala/prescale.js';
import { prepareNodeLabels } from '../src/tala/label-policy.js';

interface Case {
  name: string;
  direction: LayoutDirection;
  seed: number;
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; from: string; to: string; directed: boolean }>;
}
interface Result {
  name: string;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}
const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-cases.json', import.meta.url), 'utf8')) as Case[];
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-stage-expected.json', import.meta.url), 'utf8')) as Result[];
const labeledCases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/labeled-tree-cases.json', import.meta.url), 'utf8')) as Case[];
const labeledExpected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/labeled-tree-stage-expected.json', import.meta.url), 'utf8')) as Result[];

describe('upstream tree placement stage', () => {
  for (const index of cases.keys()) {
    it(`matches generated tree ${index} before routing refinements`, () => {
      const input = cases[index]!;
      const output = expected[index]!;
      expect(output.name).toBe(input.name);
      const prepared = prepareNodeLabels(prescaleNodes(input.nodes, input.edges));
      const placed = placeSimpleTree(prepared, input.edges, input.direction,
        new Map(prepared.map((node) => [node.id, 0])))!;
      const first = output.nodes[0]!;
      const placedFirst = placed.find((node) => node.id === first.id)!;
      for (const node of output.nodes) {
        const actual = placed.find((candidate) => candidate.id === node.id)!;
        expect(actual.width).toBe(node.width);
        expect(actual.height).toBe(node.height);
        expect(actual.x - actual.width / 2 - placedFirst.x + placedFirst.width / 2).toBe(node.x - first.x);
        expect(actual.y - actual.height / 2 - placedFirst.y + placedFirst.height / 2).toBe(node.y - first.y);
      }
    });
  }
  for (const [index, input] of labeledCases.entries()) {
    it(`matches labeled tree ${input.name}`, () => {
      const output = labeledExpected[index]!;
      const prepared = prepareNodeLabels(prescaleNodes(input.nodes, input.edges));
      const placed = placeSimpleTree(prepared, input.edges, input.direction,
        new Map(prepared.map((node) => [node.id, 0])))!;
      const first = output.nodes[0]!;
      const placedFirst = placed.find((node) => node.id === first.id)!;
      for (const node of output.nodes) {
        const actual = placed.find((candidate) => candidate.id === node.id)!;
        expect(actual.x - actual.width / 2 - placedFirst.x + placedFirst.width / 2).toBe(node.x - first.x);
        expect(actual.y - actual.height / 2 - placedFirst.y + placedFirst.height / 2).toBe(node.y - first.y);
      }
    });
  }
});
