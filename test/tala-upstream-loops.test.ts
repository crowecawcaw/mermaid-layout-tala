import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, PositionedNode } from '../src/layout.js';
import { computeLoopOffsets, outsideTopCenterLoopLabelBox, routeNodeLoops,
  type LoopOffsets } from '../src/tala/loop-routing.js';
import { routeGraphEdges } from '../src/route.js';
import { TalaGraph } from '../src/tala/graph.js';
import { layoutFlowchart } from '../src/layout.js';

interface Case {
  name: string;
  node: { shape: string; numColumns?: number; x: number; y: number; width: number; height: number };
  edges: Array<{ id: string; sourceArrowhead?: string; targetArrowhead?: string;
    labelBBox?: { width: number; height: number } }>;
}
interface Output { name: string; routes: Array<{ id: string; points: Array<{ x: number; y: number }>;
  labelTopLeft?: { x: number; y: number } }>;
  offsets: LoopOffsets }
const read = (name: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('loop-cases.json') as Case[];
const expected = read('loop-expected.json') as Output[];

describe('upstream loops.Route', () => {
  for (const [index, input] of cases.entries()) {
    it(`matches ${input.name}`, () => {
      const node: PositionedNode = { id: 'A', width: input.node.width, height: input.node.height,
        shape: input.node.shape, numColumns: input.node.numColumns,
        x: input.node.x + input.node.width / 2,
        y: input.node.y + input.node.height / 2, rank: 0, order: 0 };
      const edges: LayoutEdge[] = input.edges.map((edge) => ({ ...edge,
        from: 'A', to: 'A', directed: false }));
      const actual = routeNodeLoops(node, edges);
      expect({ name: input.name, routes: input.edges.map((edge) => ({
        id: edge.id, points: actual.get(edge.id),
        ...(edge.labelBBox ? { labelTopLeft: (() => {
          const box = outsideTopCenterLoopLabelBox(actual.get(edge.id)!, edge.labelBBox);
          return { x: box.x, y: box.y };
        })() } : {}),
      })) }).toEqual({ name: expected[index]!.name, routes: expected[index]!.routes });
      const publicRoutes = routeGraphEdges([node], edges, 'TB');
      for (const route of expected[index]!.routes) {
        const placed = publicRoutes.find((edge) => edge.id === route.id)!;
        expect(placed.points).toEqual(route.points);
        if (route.labelTopLeft) {
          const label = input.edges.find((edge) => edge.id === route.id)!.labelBBox!;
          expect({ x: placed.x - label.width / 2, y: placed.y - label.height / 2 })
            .toEqual(route.labelTopLeft);
        }
      }
      expect(computeLoopOffsets(node, edges)).toEqual(expected[index]!.offsets);
      const graph = TalaGraph.fromFlowchart([{ id: 'A', width: node.width,
        height: node.height, shape: node.shape, numColumns: node.numColumns }], edges);
      expect(graph.nodes[0]!.loopOffsets).toEqual(expected[index]!.offsets);
    });
  }

  it('normalizes a public self-loop layout after routing', () => {
    const result = layoutFlowchart([{ id: 'A', width: 100, height: 80 }],
      [{ id: 'loop', from: 'A', to: 'A', labelBBox: { width: 50, height: 20 } }],
      { strategy: 'tala', seeds: [1] });
    const node = result.nodes[0]!, edge = result.edges[0]!;
    expect(Math.min(node.x - node.width / 2, ...edge.points.map((point) => point.x),
      edge.x - edge.labelBBox!.width / 2)).toBeGreaterThanOrEqual(0);
    expect(Math.min(node.y - node.height / 2, ...edge.points.map((point) => point.y),
      edge.y - edge.labelBBox!.height / 2)).toBeGreaterThanOrEqual(0);
  });
});
