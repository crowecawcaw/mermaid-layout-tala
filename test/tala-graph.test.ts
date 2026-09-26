import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { addHubs } from '../src/tala/proximity.js';
import { initializeByGraphDistance } from '../src/tala/graph-distance.js';

describe('TALA graph model', () => {
  it('computes upstream placement cell size from node dimensions', () => {
    const similar = TalaGraph.fromFlowchart([
      { id: 'a', width: 40, height: 30 }, { id: 'b', width: 50, height: 40 },
    ], [], 'TB');
    expect(similar.cellSize).toBe(50);
    const mixed = TalaGraph.fromFlowchart([
      { id: 'a', width: 20, height: 20 }, { id: 'b', width: 200, height: 100 },
    ], [], 'TB');
    expect(mixed.cellSize).toBe(30);
  });

  it('clones topology and geometry without sharing mutable records', () => {
    const original = TalaGraph.fromFlowchart(
      [
        { id: 'group', width: 100, height: 80, isGroup: true, dir: 'LR' },
        { id: 'a', width: 40, height: 30, parentId: 'group' },
        { id: 'b', width: 40, height: 30, parentId: 'group' },
      ],
      [{ id: 'ab', from: 'a', to: 'b', labelBBox: { width: 30, height: 20 } }],
      'TB'
    );
    original.nodes[0]!.x = 20;
    original.edges[0]!.points = [{ x: 1, y: 2 }];
    const copy = original.clone();
    expect(copy).not.toBe(original);
    expect(copy.nodes[0]).not.toBe(original.nodes[0]);
    expect(copy.edges[0]).not.toBe(original.edges[0]);
    expect(copy.edges[0]!.from).toBe(copy.nodes.find((node) => node.id === 'a'));
    expect(copy.nodes.find((node) => node.id === 'a')!.parent).toBe(copy.nodes.find((node) => node.id === 'group'));
    expect(copy.directions.get(copy.nodes.find((node) => node.id === 'group')!)).toBe('LR');
    copy.edges[0]!.points[0]!.x = 99;
    expect(original.edges[0]!.points[0]!.x).toBe(1);
    copy.nodes[0]!.x = 99;
    expect(original.nodes[0]!.x).toBe(20);
  });

  it('discovers hub spokes only within the same container', () => {
    const graph = TalaGraph.fromFlowchart(
      [
        { id: 'group', width: 100, height: 80, isGroup: true },
        { id: 'hub', width: 40, height: 30, parentId: 'group' },
        { id: 'spoke', width: 40, height: 30, parentId: 'group' },
        { id: 'connected', width: 40, height: 30, parentId: 'group' },
        { id: 'outside', width: 40, height: 30 },
      ],
      [
        { id: 'hs', from: 'hub', to: 'spoke' },
        { id: 'hc', from: 'hub', to: 'connected' },
        { id: 'co', from: 'connected', to: 'outside' },
        { id: 'ho', from: 'hub', to: 'outside' },
      ],
      'TB'
    );
    addHubs(graph);
    const hub = graph.nodes.find((node) => node.id === 'hub')!;
    expect(graph.hubs.get(hub)?.map((node) => node.id)).toEqual(['spoke']);
  });

  it('rejects cyclic and invalid container references', () => {
    expect(() => TalaGraph.fromFlowchart([
      { id: 'a', width: 10, height: 10, isGroup: true, parentId: 'b' },
      { id: 'b', width: 10, height: 10, isGroup: true, parentId: 'a' },
    ], [], 'TB')).toThrow('cyclic container hierarchy');
    expect(() => TalaGraph.fromFlowchart([
      { id: 'a', width: 10, height: 10, parentId: 'missing' },
    ], [], 'TB')).toThrow('invalid parent');
  });

  it('uses the upstream graph-distance initializer only on connected graphs', () => {
    const inputs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, width: 30, height: 20 }));
    const connected = TalaGraph.fromFlowchart(inputs, [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'bc', from: 'b', to: 'c' },
      { id: 'cd', from: 'c', to: 'd' },
      { id: 'de', from: 'd', to: 'e' },
    ], 'TB');
    expect(initializeByGraphDistance(connected)).toBe(true);
    const points = connected.nodes.map((node) => node.topLeft!);
    expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBe(5);
    expect(points.every((point) => Number.isInteger(point.x) && Number.isInteger(point.y))).toBe(true);
    const duplicate = connected.clone();
    for (const node of duplicate.nodes) node.topLeft = undefined;
    expect(initializeByGraphDistance(duplicate)).toBe(true);
    expect(duplicate.nodes.map((node) => node.topLeft)).toEqual(points);

    const disconnected = TalaGraph.fromFlowchart(inputs, [], 'TB');
    expect(initializeByGraphDistance(disconnected)).toBe(false);
    expect(disconnected.nodes.every((node) => node.topLeft === undefined)).toBe(true);

    const name = (i: number) => String(i).padStart(2, '0');
    const pathNodes = Array.from({ length: 12 }, (_, i) => ({ id: name(i), width: 100, height: 50 }));
    const pathEdges = Array.from({ length: 11 }, (_, i) => ({ id: name(i), from: name(i), to: name(i + 1) }));
    const path = TalaGraph.fromFlowchart(pathNodes, pathEdges, 'TB');
    expect(initializeByGraphDistance(path)).toBe(true);
    const distance = (a: number, b: number) => {
      const first = path.nodes[a]!.topLeft!, second = path.nodes[b]!.topLeft!;
      return Math.hypot(first.x - second.x, first.y - second.y);
    };
    expect(distance(0, 11)).toBeGreaterThanOrEqual(2 * distance(0, 1));
  });
});
