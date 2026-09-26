import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutNode } from '../src/layout.js';
import { TalaGraph } from '../src/tala/graph.js';
import { prescaleNodes } from '../src/tala/prescale.js';

interface Case { name: string; nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Output { name: string; nodes: LayoutNode[] }
const read = (name: string) => JSON.parse(readFileSync(
  new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('prescale-cases.json') as Case[];
const expected = read('prescale-expected.json') as Output[];

describe('upstream placement.Prescale', () => {
  for (const [index, input] of cases.entries()) {
    it(`matches ${input.name}`, () => {
      const result = prescaleNodes(input.nodes, input.edges);
      expect({ name: input.name, nodes: result }).toEqual(expected[index]);
      expect(TalaGraph.fromFlowchart(result, input.edges).toLayoutNodes()).toEqual(result);
    });
  }
});
