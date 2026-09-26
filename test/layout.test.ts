import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';
import { TalaGraph } from '../src/tala/graph.js';
import { placeOrdinaryNodes } from '../src/tala/ordinary-placement.js';

describe('Mermaid flowchart layout slice', () => {
  it('uses translated ordinary placement for flat components by default', () => {
    const nodes = ['A', 'B', 'C', 'D'].map((id) => ({ id, width: 60, height: 40 }));
    const edges = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'ac', from: 'A', to: 'C' },
      { id: 'bd', from: 'B', to: 'D' },
      { id: 'cd', from: 'C', to: 'D' },
    ];
    const graph = TalaGraph.fromFlowchart(nodes, edges, 'TB');
    placeOrdinaryNodes(graph, 1);
    const actual = layoutFlowchart(nodes, edges, { seeds: [1] });
    const reference = graph.nodes[0]!;
    const placed = actual.nodes.find((node) => node.id === reference.id)!;
    for (const node of graph.nodes) {
      const result = actual.nodes.find((candidate) => candidate.id === node.id)!;
      expect(result.x - placed.x).toBe(node.topLeft!.x - reference.topLeft!.x);
      expect(result.y - placed.y).toBe(node.topLeft!.y - reference.topLeft!.y);
    }
  });

  it('uses deterministic layout seeds and rejects invalid lists', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, width: 50, height: 30 }));
    const edges = ['B', 'C', 'D', 'E', 'F'].map((id) => ({ id: `A${id}`, from: 'A', to: id }));
    const order = (seed: number) => layoutFlowchart(nodes, edges, { seeds: [seed], strategy: 'layered' }).nodes
      .filter((node) => node.rank === 1).sort((a, b) => a.x - b.x).map((node) => node.id).join('');
    expect(order(1)).toBe(order(1));
    expect(order(1)).not.toBe(order(5));
    expect(() => layoutFlowchart(nodes, edges, { seeds: [] })).toThrow('at least one seed');
    expect(() => layoutFlowchart(nodes, edges, { seeds: [1.5] })).toThrow('safe integers');
  });

  it('places nested subgraphs around their contents', () => {
    const result = layoutFlowchart(
      [
        { id: 'cloud', width: 100, height: 30, isGroup: true, labelBBox: { width: 100, height: 30 }, dir: 'LR' },
        { id: 'api', width: 80, height: 30, isGroup: true, parentId: 'cloud', labelBBox: { width: 80, height: 30 } },
        { id: 'data', width: 80, height: 30, isGroup: true, parentId: 'cloud', labelBBox: { width: 80, height: 30 } },
        { id: 'gateway', width: 80, height: 40, parentId: 'api' },
        { id: 'service', width: 80, height: 40, parentId: 'api' },
        { id: 'store', width: 80, height: 40, parentId: 'data' },
        { id: 'client', width: 80, height: 40 },
      ],
      [
        { id: 'incoming', from: 'client', to: 'gateway' },
        { id: 'request', from: 'gateway', to: 'service' },
        { id: 'persist', from: 'service', to: 'store' },
      ],
      { direction: 'LR' }
    );
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    for (const [childId, parentId] of [['api', 'cloud'], ['data', 'cloud'], ['gateway', 'api'], ['service', 'api'], ['store', 'data']] as const) {
      const child = byId.get(childId)!;
      const parent = byId.get(parentId)!;
      expect(child.x - child.width / 2).toBeGreaterThan(parent.x - parent.width / 2);
      expect(child.x + child.width / 2).toBeLessThan(parent.x + parent.width / 2);
      expect(child.y - child.height / 2).toBeGreaterThan(parent.y - parent.height / 2);
      expect(child.y + child.height / 2).toBeLessThan(parent.y + parent.height / 2);
    }
    expect(byId.get('api')!.x).toBeLessThan(byId.get('data')!.x);
  });

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
