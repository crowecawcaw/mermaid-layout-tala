import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHierarchyOVGVertices } from '../src/tala/ovg-hierarchy.js';
import type { LayoutDirection, LayoutEdge } from '../src/layout.js';

const read = (name: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('hierarchy-generated-cases.json') as Array<{ name: string;
  direction: LayoutDirection; edges: LayoutEdge[] }>;
const stages = read('hierarchy-generated-stage-expected.json') as Array<{ name: string;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }> }>;
const expected = read('hierarchy-ovg-expected.json') as Array<{ name: string;
  vertices: Array<[number, number]> }>;

describe('hierarchy OVG construction against Go', () => {
  for (const input of cases) it(input.name, () => {
    const nodes = stages.find((stage) => stage.name === input.name)!.nodes;
    const levels = new Map(nodes.map((node) =>
      [node.id, Number(node.id.match(/^L(\d+)_/)![1])]));
    const vertices = buildHierarchyOVGVertices(nodes, input.edges, levels, input.direction);
    expect(vertices.map((point) => [point.x, point.y])).toEqual(
      expected.find((item) => item.name === input.name)!.vertices);
  });
});
