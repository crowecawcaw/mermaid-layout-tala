import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balanceRouteRanges } from '../src/tala/edge-balance-ranges.js';
import type { PositionedEdge, PositionedNode } from '../src/layout.js';

interface InputCase { name: string; nodes: Array<{ id: string; parentId?: string;
  isGroup?: boolean }>; edges: Array<{ id: string; from: string; to: string }> }
interface Stage { index: number; nodes: Record<string, [number, number, number, number]>;
  edges: Record<string, Array<[number, number]>> }
interface Trace { name: string; stages: Stage[] }
const read = (file: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8'));
const inputs = read('compound-generated-cases.json') as InputCase[];
const traces = read('compound-route-stages-expected.json') as Trace[];

describe('compound BalanceEdgeSegments range core against Go', () => {
  for (const trace of traces) it(trace.name, () => {
    const input = inputs.find((item) => item.name === trace.name)!;
    const before = trace.stages.find((stage) => stage.index === 27)!;
    const after = trace.stages.find((stage) => stage.index === 28)!;
    const nodes = input.nodes.map((node): PositionedNode => {
      const [x, y, width, height] = before.nodes[node.id]!;
      return { ...node, x: x + width / 2, y: y + height / 2, width, height };
    });
    const edges = input.edges.map((edge): PositionedEdge => ({ ...edge,
      points: before.edges[edge.id]!.map(([x, y]) => ({ x, y })), x: 0, y: 0 }));
    const actual = balanceRouteRanges(nodes, edges);
    for (const edge of actual) {
      expect(edge.points.map((point): [number, number] => [point.x, point.y]))
        .toEqual(after.edges[edge.id]);
    }
  });
});
