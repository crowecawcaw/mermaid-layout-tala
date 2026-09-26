import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { containerAlignmentCost } from '../src/tala/container-alignment-cost.js';
import { attemptAxisShift } from '../src/tala/alignment-shift.js';
import { alignAxesPass } from '../src/tala/alignment-search.js';

describe('upstream connectedNodes ordinary-container traversal', () => {
  it('moves a connected child with its container and siblings', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 360, height: 160, isGroup: true },
      { id: 'A', width: 80, height: 40, parentId: 'G' },
      { id: 'B', width: 80, height: 40, parentId: 'G' },
      { id: 'X', width: 80, height: 40 },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bx', from: 'B', to: 'X' },
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('B')!.connectedNodes([byId.get('X')!], graph).map((node) => node.id))
      .toEqual(['B', 'A', 'G']);
    expect(byId.get('X')!.connectedNodes([byId.get('B')!], graph).map((node) => node.id))
      .toEqual(['X']);
    // Excluding a sibling blocks the upward container traversal.
    expect(byId.get('A')!.connectedNodes([byId.get('B')!], graph).map((node) => node.id))
      .toEqual(['A']);
  });

  it('preserves a nested container as part of the moved component', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Cloud', width: 500, height: 300, isGroup: true },
      { id: 'API', width: 300, height: 150, isGroup: true, parentId: 'Cloud' },
      { id: 'Gateway', width: 80, height: 40, parentId: 'API' },
      { id: 'Service', width: 80, height: 40, parentId: 'API' },
      { id: 'DB', width: 80, height: 40, parentId: 'Cloud' },
      { id: 'Client', width: 80, height: 40 },
    ], [
      { id: 'gs', from: 'Gateway', to: 'Service' },
      { id: 'sd', from: 'Service', to: 'DB' },
      { id: 'cg', from: 'Client', to: 'Gateway' },
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const moved = byId.get('Service')!.connectedNodes([byId.get('Client')!], graph)
      .map((node) => node.id);
    expect(new Set(moved)).toEqual(new Set(['Service', 'Gateway', 'DB', 'API', 'Cloud']));
  });
});

describe('upstream container alignment cost', () => {
  it('charges for diagonal equal-size peers and not aligned or nested pairs', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Left', width: 200, height: 120, isGroup: true },
      { id: 'Right', width: 200, height: 120, isGroup: true },
      { id: 'Nested', width: 200, height: 120, isGroup: true, parentId: 'Left' },
      { id: 'A', width: 80, height: 40, parentId: 'Left' },
      { id: 'B', width: 80, height: 40, parentId: 'Right' },
    ], [{ id: 'ab', from: 'A', to: 'B' }]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const [id, point] of Object.entries({
      Left: { x: 0, y: 0 }, Right: { x: 300, y: 40 },
      Nested: { x: 20, y: 20 }, A: { x: 60, y: 60 }, B: { x: 360, y: 100 },
    })) byId.get(id)!.topLeft = point;
    expect(containerAlignmentCost(graph)).toBeCloseTo(13.333333333333334);
    byId.get('Right')!.topLeft = { x: 300, y: 0 };
    expect(containerAlignmentCost(graph)).toBe(0);
  });
});

describe('upstream AlignAxes shift validity', () => {
  it('accepts the compound stage-trace move as one connected set', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 360, height: 160, isGroup: true },
      { id: 'A', width: 80, height: 40, parentId: 'G' },
      { id: 'B', width: 80, height: 40, parentId: 'G' },
      { id: 'X', width: 80, height: 40 },
    ], [{ id: 'ab', from: 'A', to: 'B' }, { id: 'bx', from: 'B', to: 'X' }]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const [id, point] of Object.entries({
      G: { x: 0, y: 0 }, A: { x: 60, y: 60 },
      B: { x: 220, y: 60 }, X: { x: 240, y: 240 },
    })) byId.get(id)!.topLeft = point;
    const edge = graph.edges[1]!;
    const moved = edge.from.connectedNodes([edge.to], graph);
    expect(attemptAxisShift(graph, edge, moved, 20, 0)).toBe(true);
    expect(graph.nodes.map((node) => node.topLeft!.x)).toEqual([20, 80, 240, 240]);
  });

  it('rejects a shift whose center line crosses an unrelated node', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', width: 80, height: 40 },
      { id: 'B', width: 80, height: 40 },
      { id: 'Blocker', width: 30, height: 30 },
    ], [{ id: 'ab', from: 'A', to: 'B' }]);
    graph.nodes[0]!.topLeft = { x: 0, y: 0 };
    graph.nodes[1]!.topLeft = { x: 200, y: 80 };
    graph.nodes[2]!.topLeft = { x: 110, y: 85 };
    expect(attemptAxisShift(graph, graph.edges[0]!, [graph.nodes[0]!], 0, 80)).toBe(false);
    expect(graph.nodes[0]!.topLeft).toEqual({ x: 0, y: 0 });
  });
});

describe('upstream AlignAxes candidate order', () => {
  it('selects the container move from the pinned compound stage trace', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 360, height: 160, isGroup: true },
      { id: 'A', width: 80, height: 40, parentId: 'G' },
      { id: 'B', width: 80, height: 40, parentId: 'G' },
      { id: 'X', width: 80, height: 40 },
    ], [{ id: 'ab', from: 'A', to: 'B' }, { id: 'bx', from: 'B', to: 'X' }]);
    for (const [node, point] of graph.nodes.map((node, index) => [node,
      [{ x: 0, y: 0 }, { x: 60, y: 60 }, { x: 220, y: 60 }, { x: 240, y: 240 }][index]!] as const)) {
      node.topLeft = point;
    }
    const score = (candidate: TalaGraph) => {
      const b = candidate.nodes[2]!, x = candidate.nodes[3]!;
      return Math.abs(b.topLeft!.x - x.topLeft!.x)
        + Math.abs(x.topLeft!.x - 240) * 2;
    };
    expect(alignAxesPass(graph, score)).toBe(true);
    expect(graph.nodes.map((node) => node.topLeft!.x)).toEqual([20, 80, 240, 240]);
  });

  it('prefers the later X attempt on a tied score', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', width: 80, height: 40 },
      { id: 'B', width: 80, height: 40 },
    ], [{ id: 'ab', from: 'A', to: 'B' }]);
    graph.nodes[0]!.topLeft = { x: 0, y: 0 };
    graph.nodes[1]!.topLeft = { x: 200, y: 200 };
    const score = (candidate: TalaGraph) => {
      const a = candidate.nodes[0]!, b = candidate.nodes[1]!;
      return Math.abs(a.topLeft!.x - b.topLeft!.x)
        + Math.abs(a.topLeft!.y - b.topLeft!.y);
    };
    expect(alignAxesPass(graph, score)).toBe(true);
    expect(graph.nodes[0]!.topLeft).toEqual({ x: 200, y: 0 });
  });
});
