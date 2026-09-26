import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { directionTransforms } from '../src/tala/direct.js';
import type { LayoutDirection, LayoutEdge } from '../src/layout.js';

interface Box { id: string; x: number; y: number; width: number; height: number }
const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-cases.json', import.meta.url), 'utf8')) as
  Array<{ name: string; direction: LayoutDirection; edges: LayoutEdge[] }>;
const raw = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-raw-expected.json', import.meta.url), 'utf8')) as
  Array<{ name: string; nodes: Box[] }>;
const placed = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/full-tree-random-stage-expected.json', import.meta.url), 'utf8')) as
  Array<{ name: string; nodes: Box[] }>;

describe('upstream graph direction mirror', () => {
  for (let index = 0; index < cases.length; index++) {
    it(`matches generated tree ${index} after tree placement`, () => {
      const input = cases[index]!;
      expect(raw[index]!.name).toBe(input.name);
      expect(placed[index]!.name).toBe(input.name);
      const transform = directionTransforms(raw[index]!.nodes, input.edges, input.direction);
      const oriented = raw[index]!.nodes.map((node) => ({
        ...node,
        x: transform.mirrorX ? -node.x - node.width : node.x,
        y: transform.mirrorY ? -node.y - node.height : node.y,
      }));
      const anchor = oriented[0]!, target = placed[index]!.nodes[0]!;
      for (const [nodeIndex, node] of oriented.entries()) {
        const expected = placed[index]!.nodes[nodeIndex]!;
        expect(node.x - anchor.x).toBe(expected.x - target.x);
        expect(node.y - anchor.y).toBe(expected.y - target.y);
      }
    });
  }
});
