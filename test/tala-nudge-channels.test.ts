import { describe, expect, it } from 'vitest';
import type { PositionedEdge, PositionedNode } from '../src/layout.js';
import { nudgeEdgeChannels } from '../src/tala/nudge-channels.js';

const node = (id: string, left: number, top: number, width = 100,
  height = 100): PositionedNode => ({ id, x: left + width / 2,
  y: top + height / 2, width, height, rank: 0, order: 0 });
const edge = (id: string, points: Array<[number, number]>): PositionedEdge => ({
  id, from: 'from', to: 'to', x: 0, y: 0, directed: true,
  points: points.map(([x, y]) => ({ x, y })),
});
const zGraph = () => ({ nodes: [node('from', 0, 0), node('to', 300, 200)],
  edges: [edge('z', [[100, 50], [120, 50], [120, 250], [300, 250]])] });

describe('TALA channel nudging', () => {
  it('centers a four-point corridor, keeps ports fixed, and is idempotent', () => {
    const { nodes, edges } = zGraph();
    const result = nudgeEdgeChannels(nodes, edges);
    expect(result[0]!.points[0]).toEqual({ x: 100, y: 50 });
    expect(result[0]!.points.at(-1)).toEqual({ x: 300, y: 250 });
    expect(result[0]!.points[1]!.x).toBeCloseTo(200, 5);
    expect(result[0]!.points[2]!.x).toBeCloseTo(200, 5);
    expect(nudgeEdgeChannels(nodes, result)).toEqual(result);
    expect(edges[0]!.points[1]!.x).toBe(120);
  });

  it('moves duplicated trunks together and leaves a loop fixed', () => {
    const { nodes, edges } = zGraph();
    edges.push(edge('duplicate', [[100, 50], [120, 50], [120, 250], [300, 250]]));
    edges.push({ ...edge('loop', [[50, 50], [50, 50]]), to: 'from' });
    const result = nudgeEdgeChannels(nodes, edges);
    expect(result[0]!.points).toEqual(result[1]!.points);
    expect(result[0]!.points[1]!.x).toBeCloseTo(200, 5);
    expect(result[2]!.points).toEqual(edges[2]!.points);
  });

  it('preserves an unbounded outer route', () => {
    const { nodes } = zGraph();
    nodes[1] = node('to', 0, 200);
    const route = edge('outer', [[100, 50], [160, 50], [160, 250], [100, 250]]);
    expect(nudgeEdgeChannels(nodes, [route])[0]!.points).toEqual(route.points);
  });

  it('does not pull a route into a narrow node gap', () => {
    const nodes = [node('container', 0, 200, 200, 300),
      node('from', 50, 300, 50, 50), node('to', 400, 300, 50, 50),
      node('ceiling', 0, 0, 500, 169)];
    const route = edge('gap', [[75, 300], [75, 179], [425, 179], [425, 300]]);
    expect(nudgeEdgeChannels(nodes, [route])[0]!.points[1]!.y).toBe(179);
  });
});
