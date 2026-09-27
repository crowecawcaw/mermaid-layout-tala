import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge,
  type LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Expected { name: string; nodes: Array<{ id: string; x: number;
  y: number; width: number; height: number }>;
  edges: Array<{ id: string; points: Array<{ x: number; y: number }> }> }
const read = (file: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8'));
const cases = read('compound-generated-cases.json') as Case[];
const expected = read('compound-generated-expected.json') as Expected[];

describe('generated compound graphs against complete Go pipeline', () => {
  for (const name of ['chain-TB-2', 'chain-LR-2', 'chain-RL-2']) it(name, () => {
    const input = cases.find((item) => item.name === name)!;
    const oracle = expected.find((item) => item.name === name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const actualAnchor = actual.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
    const dx = actualAnchor.x - actualAnchor.width / 2 - oracle.nodes[0]!.x;
    const dy = actualAnchor.y - actualAnchor.height / 2 - oracle.nodes[0]!.y;
    expect(oracle.nodes.map((node) => {
      const placed = actual.nodes.find((item) => item.id === node.id)!;
      return { id: node.id, x: placed.x - placed.width / 2 - dx,
        y: placed.y - placed.height / 2 - dy,
        width: placed.width, height: placed.height };
    })).toEqual(oracle.nodes);
    expect(oracle.edges.map((edge) => ({ id: edge.id,
      points: actual.edges.find((item) => item.id === edge.id)!.points.map((point) => ({
        x: point.x - dx, y: point.y - dy,
      })) }))).toEqual(oracle.edges);
  });

  for (const name of ['chain-TB-3', 'chain-BT-3', 'chain-BT-4', 'chain-RL-3'])
    it(`${name} node boxes`, () => {
      const input = cases.find((item) => item.name === name)!;
      const oracle = expected.find((item) => item.name === name)!;
      const actual = layoutFlowchart(input.nodes, input.edges,
        { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
      const actualAnchor = actual.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const dx = actualAnchor.x - actualAnchor.width / 2 - oracle.nodes[0]!.x;
      const dy = actualAnchor.y - actualAnchor.height / 2 - oracle.nodes[0]!.y;
      expect(oracle.nodes.map((node) => {
        const placed = actual.nodes.find((item) => item.id === node.id)!;
        return { id: node.id, x: placed.x - placed.width / 2 - dx,
          y: placed.y - placed.height / 2 - dy,
          width: placed.width, height: placed.height };
      })).toEqual(oracle.nodes);
    });
});
