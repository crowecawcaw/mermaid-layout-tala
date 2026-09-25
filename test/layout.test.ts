import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';

describe('Mermaid flowchart layout slice', () => {
  it('uses hierarchy ranks and measured node sizes', () => {
    const result = layoutFlowchart(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 110, height: 50 },
        { id: 'C', width: 70, height: 30 },
        { id: 'D', width: 90, height: 40 },
      ],
      [
        { id: 'ab', from: 'A', to: 'B' },
        { id: 'ac', from: 'A', to: 'C' },
        { id: 'bd', from: 'B', to: 'D' },
        { id: 'cd', from: 'C', to: 'D' },
      ]
    );
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    expect(byId.get('A')!.rank).toBe(0);
    expect(byId.get('B')!.rank).toBe(1);
    expect(byId.get('C')!.rank).toBe(1);
    expect(byId.get('D')!.rank).toBe(2);
    expect(byId.get('B')!.height).toBe(50);
    expect(byId.get('B')!.y).toBeLessThan(byId.get('D')!.y);
    for (const edge of result.edges) {
      const source = byId.get(edge.from)!;
      const target = byId.get(edge.to)!;
      expect(isOnBoundary(edge.points[0]!, source)).toBe(true);
      expect(isOnBoundary(edge.points.at(-1)!, target)).toBe(true);
      for (let i = 1; i < edge.points.length; i++) {
        const previous = edge.points[i - 1]!;
        const current = edge.points[i]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
  });

  it('handles cycles, self loops, parallel edges, and disconnected components', () => {
    const result = layoutFlowchart(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 60, height: 30 },
        { id: 'C', width: 60, height: 30 },
        { id: 'solo', width: 40, height: 20 },
      ],
      [
        { id: 'ab', from: 'A', to: 'B' },
        { id: 'ba', from: 'B', to: 'A' },
        { id: 'bc', from: 'B', to: 'C' },
        { id: 'loop', from: 'C', to: 'C' },
        { id: 'ab2', from: 'A', to: 'B' },
      ]
    );
    expect(result.edges).toHaveLength(5);
    for (const edge of result.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      for (let i = 1; i < edge.points.length; i++) {
        const previous = edge.points[i - 1]!;
        const current = edge.points[i]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
    const solo = result.nodes.find((node) => node.id === 'solo')!;
    expect(result.nodes.filter((node) => node.id !== 'solo').every((node) => node.x !== solo.x || node.y !== solo.y)).toBe(true);
  });

  it('supports all four Mermaid directions and stable results', () => {
    const nodes = [
      { id: 'A', width: 50, height: 30 },
      { id: 'B', width: 70, height: 40 },
      { id: 'C', width: 60, height: 30 },
    ];
    const edges = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'ac', from: 'A', to: 'C' },
    ];
    const tb = layoutFlowchart(nodes, edges);
    const lr = layoutFlowchart(nodes, edges, { direction: 'LR' });
    const bt = layoutFlowchart(nodes, edges, { direction: 'BT' });
    const rl = layoutFlowchart(nodes, edges, { direction: 'RL' });
    expect(tb.nodes.find((node) => node.id === 'A')!.y).toBeLessThan(tb.nodes.find((node) => node.id === 'B')!.y);
    expect(lr.nodes.find((node) => node.id === 'A')!.x).toBeLessThan(lr.nodes.find((node) => node.id === 'B')!.x);
    expect(bt.nodes.find((node) => node.id === 'A')!.y).toBeGreaterThan(bt.nodes.find((node) => node.id === 'B')!.y);
    expect(rl.nodes.find((node) => node.id === 'A')!.x).toBeGreaterThan(rl.nodes.find((node) => node.id === 'B')!.x);
    expect(layoutFlowchart([...nodes].reverse(), [...edges].reverse())).toEqual(tb);
  });
});

function isOnBoundary(point: { x: number; y: number }, node: { x: number; y: number; width: number; height: number }): boolean {
  const leftOrRight = Math.abs(Math.abs(point.x - node.x) - node.width / 2) < 1e-7;
  const topOrBottom = Math.abs(Math.abs(point.y - node.y) - node.height / 2) < 1e-7;
  return leftOrRight || topOrBottom;
}
