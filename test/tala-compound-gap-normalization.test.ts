import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { normalizeGaps } from '../src/tala/gap-normalization.js';
import type { LayoutDirection, LayoutEdge, LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; nodes: LayoutNode[];
  edges: LayoutEdge[] }
const cases = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/compound-generated-cases.json', import.meta.url), 'utf8')) as Case[];

describe('compound gap normalization against the Go stage', () => {
  it('accepts paired reverse and container moves after validating their final geometry', () => {
    const input = cases.find((item) => item.name === 'chain-TB-4')!;
    const graph = TalaGraph.fromFlowchart(input.nodes, input.edges, input.direction);
    const before: Record<string, [number, number, number, number]> = {
      Group: [0, 0, 348, 319], N0: [66, 227, 58, 32],
      N1: [60, 60, 70, 39], N2: [206, 63, 82, 32],
      N3: [148, 220, 58, 39], Input: [-6, 390, 75, 43],
      Output: [108, 395, 82, 38],
    };
    for (const node of graph.nodes) {
      const [x, y, width, height] = before[node.id]!;
      node.topLeft = { x, y };
      node.width = width;
      node.height = height;
    }
    graph.cellSize = 48;
    const n0 = graph.nodes.find((node) => node.id === 'N0')!;
    const n3 = graph.nodes.find((node) => node.id === 'N3')!;
    n0.nears.add(n3);
    n3.nears.add(n0);

    expect(normalizeGaps(graph)).toBe(true);
    expect(graph.nodes.map((node) => [node.id, node.topLeft!.x, node.topLeft!.y,
      node.width, node.height])).toEqual([
      ['Group', 0, -55, 348, 370], ['N0', 66, 223, 58, 32],
      ['N1', 60, 5, 70, 39], ['N2', 206, 12, 82, 32],
      ['N3', 148, 216, 58, 39], ['Input', -6, 357, 75, 43],
      ['Output', 108, 340, 82, 38],
    ]);
  });
});
