import { describe, expect, it } from 'vitest';
import type { Point, PositionedEdge, PositionedNode } from '../src/layout.js';
import { simplifyEdgeRoutes } from '../src/tala/edge-simplify.js';

const point = (x: number, y: number): Point => ({ x, y });
const node = (id: string, left: number, top: number, width: number, height: number): PositionedNode => ({
  id, x: left + width / 2, y: top + height / 2, width, height, rank: 0, order: 0,
});
const edge = (id: string, from: string, to: string, points: Point[]): PositionedEdge => ({
  id, from, to, points, x: 0, y: 0,
});
const transposedPoint = ({ x, y }: Point): Point => ({ x: y, y: x });
const transposedNode = (n: PositionedNode): PositionedNode => ({ ...n,
  x: n.y, y: n.x, width: n.height, height: n.width });

describe('upstream routing.SimplifyEdgeRoutes', () => {
  for (const transpose of [false, true]) {
    for (const obstruction of ['node', 'edge', 'target approach', 'clear'] as const) {
      it(`${transpose ? 'vertical' : 'horizontal'} ${obstruction}`, () => {
        const from = node('from', 0, 0, 40, 40);
        const to = node('to', obstruction === 'target approach' ? 180 : 240,
          obstruction === 'target approach' ? 30 : 50, 40, 40);
        const route = edge('route', 'from', 'to', [point(40, 20), point(80, 20),
          point(80, 120), point(200, 120), point(200, 70), point(240, 70)]);
        if (obstruction === 'target approach') route.points.pop();
        const nodes = [from, to];
        const edges = [route];
        if (obstruction === 'node') nodes.push(node('obstacle', 190, 35, 20, 20));
        if (obstruction === 'edge') {
          nodes.push(node('other-a', 140, 40, 10, 10), node('other-b', 210, 40, 10, 10));
          edges.push(edge('other', 'other-a', 'other-b', [point(150, 45), point(210, 45)]));
        }
        const inputNodes = transpose ? nodes.map(transposedNode) : nodes;
        const inputEdges = transpose ? edges.map((item) => ({ ...item,
          points: item.points.map(transposedPoint) })) : edges;
        const before = inputEdges[0]!.points.map((item) => ({ ...item }));
        const simplified = simplifyEdgeRoutes(inputNodes, inputEdges);
        const expected = obstruction === 'clear'
          ? [point(40, 20), point(200, 20), point(200, 70), point(240, 70)] : before;
        expect(simplified[0]!.points).toEqual(transpose && obstruction === 'clear'
          ? expected.map(transposedPoint) : expected);
        expect(inputEdges[0]!.points).toEqual(before);
      });
    }
  }

  it('rejects a new bend inside a small obstacle', () => {
    const nodes = [node('from', 1000, 1000, 10, 10),
      node('to', 2000, 2000, 10, 10), node('obstacle', 16, -4, 8, 8)];
    const points = [point(0, 0), point(10, 0), point(10, 10), point(20, 10), point(20, 0)];
    expect(simplifyEdgeRoutes(nodes, [edge('route', 'from', 'to', points)])[0]!.points)
      .toEqual(points);
  });
});
