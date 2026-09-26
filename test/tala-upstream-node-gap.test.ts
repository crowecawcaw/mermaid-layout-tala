import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { nodeDelta } from '../src/tala/overlap.js';
import type { LoopOffsets } from '../src/tala/loop-routing.js';

interface InputNode {
  shape?: string; width: number; height: number; x: number; y: number;
  loopOffsets?: { top: number; left: number; bottom: number; right: number };
  labelBBox?: { width: number; height: number }; labelPosition?: string;
}
interface Case { name: string; first: InputNode; second: InputNode;
  edge?: { minWidth: number; minHeight: number }; candidate: { x: number; y: number } }
interface Output { name: string; delta: number }
const read = (name: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('node-gap-cases.json') as Case[];
const expected = read('node-gap-expected.json') as Output[];

describe('upstream layoutgraph.Node.deltaTo', () => {
  for (const [index, input] of cases.entries()) {
    it(`matches ${input.name}`, () => {
      const graph = TalaGraph.fromFlowchart([
        { ...input.first, id: 'A' }, { ...input.second, id: 'B' },
      ], input.edge ? [{ id: 'AB', from: 'A', to: 'B', ...input.edge }] : []);
      for (const [node, source] of [[graph.nodes[0]!, input.first],
        [graph.nodes[1]!, input.second]] as const) {
        node.topLeft = { x: source.x, y: source.y };
        if (source.loopOffsets) {
          const { top, left, bottom, right } = source.loopOffsets;
          node.loopOffsets = { top, left, bottom, right,
            topLeft: Math.max(top, left), topRight: Math.max(top, right),
            bottomLeft: Math.max(bottom, left), bottomRight: Math.max(bottom, right) } satisfies LoopOffsets;
        }
      }
      expect({ name: input.name, delta: nodeDelta(graph.nodes[0]!, graph.nodes[1]!, input.candidate) })
        .toEqual(expected[index]);
    });
  }
});
