import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';

describe('fixed node origins in public TALA layout', () => {
  it('preserves a fixed node in a connected component while packing an isolated node', () => {
    const result = layoutFlowchart([
      { id: 'A', width: 60, height: 40, fixedTopLeft: { x: 200, y: 100 } },
      { id: 'B', width: 60, height: 40 },
      { id: 'C', width: 60, height: 40 },
    ], [{ id: 'AB', from: 'A', to: 'B' }], { strategy: 'tala', seeds: [1] });
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    expect(byId.get('A')).toMatchObject({ x: 230, y: 120 });
    const c = byId.get('C')!;
    const a = byId.get('A')!, b = byId.get('B')!;
    expect(c.x - c.width / 2).toBeGreaterThanOrEqual(
      Math.max(a.x + a.width / 2, b.x + b.width / 2) + 20);
  });

  it('preserves an isolated fixed node', () => {
    const result = layoutFlowchart([
      { id: 'A', width: 50, height: 30, fixedTopLeft: { x: -75, y: 130 } },
    ], [], { strategy: 'tala', seeds: [1] });
    expect(result.nodes[0]).toMatchObject({ x: -50, y: 145 });
  });
});
