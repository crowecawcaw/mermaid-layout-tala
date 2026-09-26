import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { ordinaryAlignmentDeltas } from '../src/tala/alignment-deltas.js';

function deltas(first: { x: number; y: number; width?: number; height?: number },
  second: { x: number; y: number; width?: number; height?: number }) {
  const graph = TalaGraph.fromFlowchart([
    { id: 'A', width: first.width ?? 80, height: first.height ?? 40 },
    { id: 'B', width: second.width ?? 80, height: second.height ?? 40 },
  ], [{ id: 'e', from: 'A', to: 'B' }]);
  graph.nodes[0]!.topLeft = { x: first.x, y: first.y };
  graph.nodes[1]!.topLeft = { x: second.x, y: second.y };
  return ordinaryAlignmentDeltas(graph.edges[0]!);
}

describe('upstream placement.alignmentDeltas ordinary endpoints', () => {
  it('finds the stage-trace offset between a child and an outgoing node', () => {
    expect(deltas({ x: 220, y: 60 }, { x: 240, y: 240 })).toEqual({ x: 20, y: 0 });
  });
  it('aligns the cross axis of horizontal and vertical peers', () => {
    expect(deltas({ x: 0, y: 0 }, { x: 200, y: 25 })).toEqual({ x: 0, y: 25 });
    expect(deltas({ x: 0, y: 0 }, { x: 25, y: 200 })).toEqual({ x: 25, y: 0 });
  });
  it('declines diagonal shifts when either orthogonal gap is too small', () => {
    expect(deltas({ x: 0, y: 0 }, { x: 120, y: 70 })).toEqual({ x: 0, y: 0 });
    expect(deltas({ x: 0, y: 0 }, { x: 200, y: 150 })).toEqual({ x: 200, y: 150 });
  });
});
