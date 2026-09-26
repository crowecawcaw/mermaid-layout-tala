import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';
import { TalaGraph, TalaNode } from '../src/tala/graph.js';
import { StepWedgeWidth, sequenceAdvance, TalaSequence } from '../src/tala/sequence-geometry.js';
import { activateSequences, identifySequences, sequenceDefiningEdges } from '../src/tala/sequence-topology.js';

describe('upstream Step sequence rules', () => {
  it('uses the same wedge advance as layoutgraph.SequenceAdvance', () => {
    expect([-1, 0, 10, StepWedgeWidth, 100].map(sequenceAdvance))
      .toEqual([0, 0, 5, 17.5, 65]);
  });

  it('widens narrow steps, equalizes heights and arranges the vessel', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', shape: 'Step', width: 20, height: 10 },
      { id: 'B', shape: 'Step', width: 100, height: 30 },
      { id: 'C', shape: 'Step', width: 35, height: 20 },
    ], []);
    const vessel = new TalaSequence(new TalaNode({ id: 'V', width: 1, height: 1 }), graph.nodes, null);
    expect([vessel.vessel.width, vessel.vessel.height]).toEqual([170, 30]);
    expect(graph.nodes.map((node) => [node.width, node.height])).toEqual([[70, 30], [100, 30], [70, 30]]);
    vessel.vessel.topLeft = { x: 12, y: 34 };
    vessel.arrangeSteps();
    expect(graph.nodes.map((node) => node.topLeft)).toEqual([
      { x: 12, y: 34 }, { x: 47, y: 34 }, { x: 112, y: 34 },
    ]);
  });

  it('finds runs across non-step siblings and consumes the first defining edge', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', shape: 'Step', width: 40, height: 20 },
      { id: 'X', width: 40, height: 20 },
      { id: 'B', shape: 'Step', width: 40, height: 20 },
      { id: 'C', shape: 'Step', width: 40, height: 20 },
      { id: 'D', shape: 'Step', width: 40, height: 20, fixedTopLeft: { x: 0, y: 0 } },
    ], [
      { id: 'e1', from: 'B', to: 'A' }, { id: 'e2', from: 'A', to: 'B' },
      { id: 'e3', from: 'B', to: 'C' }, { id: 'e4', from: 'C', to: 'D' },
    ]);
    expect(identifySequences(graph, null).map((run) => run.map((node) => node.id)))
      .toEqual([['A', 'B', 'C']]);
    expect(sequenceDefiningEdges(graph)).toEqual(['e1', 'e3']);
  });

  it('abducts external edges, disconnects defining edges and restores topology', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', shape: 'Step', width: 20, height: 10 },
      { id: 'B', shape: 'Step', width: 40, height: 30 },
      { id: 'X', width: 45, height: 25 },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'xa', from: 'X', to: 'A' },
      { id: 'bx', from: 'B', to: 'X' },
    ]);
    const originalEdges = graph.toLayoutEdges();
    const active = activateSequences(graph, ['V']);
    expect(graph.nodes.map((node) => node.id)).toEqual(['X', 'V']);
    expect(graph.edges.map((edge) => [edge.id, edge.from.id, edge.to.id])).toEqual([
      ['xa', 'X', 'V'], ['bx', 'V', 'X'],
    ]);
    expect(active.sequences[0]!.edgeAbductions.map((item) => item.edge.id)).toEqual(['xa', 'bx']);
    active.sequences[0]!.vessel.topLeft = { x: 50, y: 70 };
    active.restore();
    expect(graph.nodes.map((node) => node.id)).toEqual(['A', 'B', 'X']);
    expect(graph.toLayoutEdges()).toEqual(originalEdges);
    expect(graph.nodes.slice(0, 2).map((node) => node.topLeft)).toEqual([
      { x: 50, y: 70 }, { x: 85, y: 70 },
    ]);
  });

  it('handles runs inside a container without moving unrelated siblings', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 240, height: 180, isGroup: true },
      { id: 'A', parentId: 'G', shape: 'Step', width: 40, height: 30 },
      { id: 'X', parentId: 'G', width: 40, height: 30 },
      { id: 'B', parentId: 'G', shape: 'Step', width: 40, height: 30 },
      { id: 'Outside', width: 40, height: 30 },
    ], [
      { id: 'ab', from: 'A', to: 'B' }, { id: 'outside', from: 'B', to: 'Outside' },
    ]);
    const group = graph.nodes[0]!;
    const originalChildren = [...group.children];
    expect(sequenceDefiningEdges(graph)).toEqual(['ab']);
    const active = activateSequences(graph, ['V']);
    expect(group.children.map((node) => node.id)).toEqual(['X', 'V']);
    expect(graph.containers.get(group)?.map((node) => node.id)).toEqual(['X', 'V']);
    expect(graph.edges.map((edge) => [edge.id, edge.from.id, edge.to.id]))
      .toEqual([['outside', 'V', 'Outside']]);
    active.restore();
    expect(group.children).toEqual(originalChildren);
    expect(graph.containers.get(group)).toEqual(originalChildren);
  });

  it('places a connected run as one horizontal Step sequence in the public layout', () => {
    const result = layoutFlowchart([
      { id: 'A', shape: 'Step', width: 20, height: 10 },
      { id: 'B', shape: 'Step', width: 40, height: 30 },
      { id: 'C', shape: 'Step', width: 80, height: 20 },
    ], [{ id: 'ab', from: 'A', to: 'B' }, { id: 'bc', from: 'B', to: 'C' }],
    { strategy: 'tala', seeds: [1] });
    const [a, b, c] = ['A', 'B', 'C'].map((id) => result.nodes.find((node) => node.id === id)!);
    // Pinned D2 TALA engine at bf337903: final normalized node boxes are
    // A=(0,0 70x30), B=(35,0 40x30), C=(40,0 80x30), with both edges consumed.
    expect(result.nodes.map((node) => [node.id, node.x - node.width / 2,
      node.y - node.height / 2, node.width, node.height]))
      .toEqual([['A', 0, 0, 70, 30], ['B', 35, 0, 40, 30], ['C', 40, 0, 80, 30]]);
    expect(result.edges.map((edge) => [edge.id, edge.points])).toEqual([
      ['ab', []], ['bc', []],
    ]);
    expect(a.y - a.height / 2).toBe(b.y - b.height / 2);
    expect(b.y - b.height / 2).toBe(c.y - c.height / 2);
    expect(b.x - b.width / 2 - (a.x - a.width / 2)).toBe(sequenceAdvance(a.width));
    expect(c.x - c.width / 2 - (b.x - b.width / 2)).toBe(sequenceAdvance(b.width));
  });

  it('suppresses defining edges inside a nested container as well', () => {
    const result = layoutFlowchart([
      { id: 'G', width: 240, height: 180, isGroup: true },
      { id: 'A', parentId: 'G', shape: 'Step', width: 40, height: 30 },
      { id: 'B', parentId: 'G', shape: 'Step', width: 40, height: 30 },
      { id: 'X', width: 60, height: 35 },
    ], [
      { id: 'ab', from: 'A', to: 'B' }, { id: 'bx', from: 'B', to: 'X' },
    ], { strategy: 'tala', seeds: [1] });
    expect(result.edges.find((edge) => edge.id === 'ab')?.points).toEqual([]);
    expect(result.edges.find((edge) => edge.id === 'bx')?.points.length).toBeGreaterThanOrEqual(2);
    const a = result.nodes.find((node) => node.id === 'A')!;
    const b = result.nodes.find((node) => node.id === 'B')!;
    expect(b.x - b.width / 2 - (a.x - a.width / 2)).toBe(sequenceAdvance(a.width));
  });
});
