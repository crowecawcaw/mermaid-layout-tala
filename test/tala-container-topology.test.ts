import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { projectContainerEdges } from '../src/tala/container-topology.js';

describe('layoutgraph.Graph.abductEdges container projection', () => {
  it('projects cross-container edges to their direct child ancestors', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Left', width: 180, height: 130, isGroup: true },
      { id: 'A', width: 70, height: 35, parentId: 'Left' },
      { id: 'B', width: 70, height: 35, parentId: 'Left' },
      { id: 'Right', width: 180, height: 130, isGroup: true },
      { id: 'C', width: 70, height: 35, parentId: 'Right' },
      { id: 'D', width: 70, height: 35, parentId: 'Right' },
    ], [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bc', from: 'B', to: 'C' },
      { id: 'cd', from: 'C', to: 'D' },
    ]);
    const before = graph.toLayoutEdges();
    const root = projectContainerEdges(graph, null);
    expect(root.projected.map((edge) => [edge.id, edge.from.id, edge.to.id]))
      .toEqual([['bc', 'Left', 'Right']]);
    expect(root.abductions.map((item) => [item.edge.id, item.originallyFrom?.id,
      item.originallyTo?.id, item.currentFrom?.id, item.currentTo?.id]))
      .toEqual([['bc', 'B', 'C', 'Left', 'Right']]);
    root.restore();
    expect(graph.toLayoutEdges()).toEqual(before);
    root.restore();
    const left = projectContainerEdges(graph, graph.nodes[0]!);
    expect(left.projected.map((edge) => edge.id)).toEqual(['ab']);
    expect(left.abductions).toEqual([]);
    left.restore();
    expect(graph.toLayoutEdges()).toEqual(before);
  });

  it('ignores a direct-child to its own descendant during placement', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Outer', width: 200, height: 150, isGroup: true },
      { id: 'Inner', width: 120, height: 100, parentId: 'Outer', isGroup: true },
      { id: 'Leaf', width: 40, height: 30, parentId: 'Inner' },
      { id: 'Peer', width: 40, height: 30, parentId: 'Outer' },
    ], [
      { id: 'inside', from: 'Inner', to: 'Leaf' },
      { id: 'cross', from: 'Leaf', to: 'Peer' },
    ]);
    const inner = graph.nodes[1]!;
    const before = graph.toLayoutEdges();
    const projected = projectContainerEdges(graph, graph.nodes[0]!);
    expect(projected.projected.map((edge) => [edge.id, edge.from.id, edge.to.id]))
      .toEqual([['cross', 'Inner', 'Peer']]);
    expect(projected.abductions.map((item) => ({ id: item.edge.id,
      original: [item.originallyFrom?.id, item.originallyTo?.id],
      current: [item.currentFrom?.id, item.currentTo?.id] }))).toEqual([
      { id: 'inside', original: ['Inner', 'Leaf'], current: [undefined, undefined] },
      { id: 'cross', original: ['Leaf', undefined], current: ['Inner', 'Peer'] },
    ]);
    expect(inner.edges.map((edge) => edge.id)).toEqual(['cross']);
    projected.restore();
    expect(graph.toLayoutEdges()).toEqual(before);
    expect(inner.edges.map((edge) => edge.id)).toEqual(['inside']);
  });
});
