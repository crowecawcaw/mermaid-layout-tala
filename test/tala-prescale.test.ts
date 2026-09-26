import { describe, expect, it } from 'vitest';
import { prescaleNodes } from '../src/tala/prescale.js';

describe('upstream edge-port prescaling', () => {
  it('expands both dimensions for a node with five neighbors', () => {
    const nodes = [{ id: 'A', width: 90, height: 40 },
      ...'BCDEF'.split('').map((id) => ({ id, width: 60, height: 40 }))];
    const edges = 'BCDEF'.split('').map((to, index) => ({ id: `e${index}`, from: 'A', to }));
    const scaled = prescaleNodes(nodes, edges);
    expect(scaled[0]).toMatchObject({ width: 120, height: 120 });
    expect(scaled.slice(1).map((node) => [node.width, node.height])).toEqual(Array(5).fill([60, 40]));
    expect(nodes[0]).toMatchObject({ width: 90, height: 40 });
  });

  it('counts parallel edges to the same neighbor and ignores self loops', () => {
    const scaled = prescaleNodes([
      { id: 'A', width: 30, height: 50 }, { id: 'B', width: 30, height: 50 },
    ], [
      { id: 'e1', from: 'A', to: 'B' }, { id: 'e2', from: 'A', to: 'B' },
      { id: 'e3', from: 'A', to: 'A' },
    ]);
    expect(scaled.map((node) => [node.width, node.height])).toEqual([[120, 120], [120, 120]]);
  });

  it('preserves square shapes and explicit dimensions', () => {
    const edges = 'BCDEF'.split('').map((to, index) => ({ id: `e${index}`, from: 'A', to }));
    const scaled = prescaleNodes([
      { id: 'A', width: 30, height: 70, aspectRatio1: true },
      ...'BCDE'.split('').map((id) => ({ id, width: 50, height: 40 })),
      { id: 'F', width: 50, height: 40, desiredWidth: 50 },
    ], edges);
    expect(scaled[0]).toMatchObject({ width: 120, height: 120 });
    expect(scaled.at(-1)).toMatchObject({ width: 50, height: 40 });
  });
});
