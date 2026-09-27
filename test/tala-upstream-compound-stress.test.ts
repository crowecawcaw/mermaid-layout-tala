import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge,
  type LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Oracle { name: string; nodes: Array<{ id: string; x: number;
  y: number; width: number; height: number }>;
  edges: Array<{ id: string; points: Array<{ x: number; y: number }> }> }
const read = (file: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8'));
const cases = read('compound-stress-cases.json') as Case[];
const expected = read('compound-stress-expected.json') as Oracle[];

describe('compound hierarchy geometry against complete Go pipeline', () => {
  for (const name of ['grouped-tree-TB', 'grouped-tree-LR', 'grouped-tree-RL']) {
    it(name, () => {
      const input = cases.find((item) => item.name === name)!;
      const oracle = expected.find((item) => item.name === name)!;
      const actual = layoutFlowchart(input.nodes, input.edges,
        { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
      const anchor = oracle.nodes[0]!;
      const placedAnchor = actual.nodes.find((node) => node.id === anchor.id)!;
      const dx = placedAnchor.x - placedAnchor.width / 2 - anchor.x;
      const dy = placedAnchor.y - placedAnchor.height / 2 - anchor.y;
      expect(oracle.nodes.map((node) => {
        const placed = actual.nodes.find((item) => item.id === node.id)!;
        return { id: node.id, x: placed.x - placed.width / 2 - dx,
          y: placed.y - placed.height / 2 - dy,
          width: placed.width, height: placed.height };
      })).toEqual(oracle.nodes);
      expect(oracle.edges.map((edge) => {
        const routed = actual.edges.find((item) => item.id === edge.id)!;
        return { id: edge.id, points: routed.points.map((point) => ({
          x: point.x - dx, y: point.y - dy,
        })) };
      })).toEqual(oracle.edges);
    });
  }
});
