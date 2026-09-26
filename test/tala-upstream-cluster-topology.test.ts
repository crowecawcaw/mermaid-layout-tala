import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { prescaleNodes } from '../src/tala/prescale.js';
import { discoverFlatClusters } from '../src/tala/flat-clusters.js';
import { activateFlatClusters } from '../src/tala/cluster-topology.js';
import type { LayoutDirection, LayoutEdge, LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Output { name: string;
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; from: string; to: string }>;
  abductions: Array<{ vessel: string; edge: string; originallyFrom?: string;
    originallyTo?: string; currentFrom: string; currentTo: string }> }
const read = (name: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('flat-cluster-cases.json') as Case[];
const expected = read('flat-cluster-topology-expected.json') as Output[];

describe('upstream cluster topology mutation', () => {
  for (const [index, input] of cases.entries()) {
    it(`activates and restores ${input.name}`, () => {
      const prescaled = prescaleNodes(input.nodes, input.edges);
      const graph = TalaGraph.fromFlowchart(prescaled, input.edges, input.direction);
      const discovery = discoverFlatClusters(prescaled, input.edges, input.seed);
      const beforeIds = graph.nodes.map((node) => node.id);
      const beforeEdges = graph.toLayoutEdges();
      const active = activateFlatClusters(graph, discovery.clusters.map((cluster, number) => ({
        nodes: cluster.nodes, arrangement: cluster.arrangement, padding: cluster.padding,
        vesselId: `__tala_cluster_${number}`,
      })));
      const output = {
        name: input.name,
        nodes: graph.nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
        edges: graph.edges.map((edge) => ({ id: edge.id, from: edge.from.id, to: edge.to.id })),
        abductions: active.clusters.flatMap((cluster) => cluster.edgeAbductions.map((abduction) => ({
          vessel: cluster.vessel.id, edge: abduction.edge.id,
          ...(abduction.originallyFrom ? { originallyFrom: abduction.originallyFrom.id } : {}),
          ...(abduction.originallyTo ? { originallyTo: abduction.originallyTo.id } : {}),
          currentFrom: abduction.currentFrom.id, currentTo: abduction.currentTo.id,
        }))),
      };
      if (discovery.clusters.length > 0) expect(output).toEqual(expected[index]);
      active.restore();
      expect(graph.nodes.map((node) => node.id)).toEqual(beforeIds);
      expect(graph.toLayoutEdges()).toEqual(beforeEdges);
      active.restore();
      expect(graph.nodes.map((node) => node.id)).toEqual(beforeIds);
    });
  }
  it('restores nested container ownership and adjacency', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'G', width: 220, height: 180, isGroup: true },
      { id: 'A', width: 40, height: 30, parentId: 'G' },
      { id: 'B', width: 40, height: 30, parentId: 'G' },
      { id: 'C', width: 50, height: 35, parentId: 'G' },
    ], [{ id: 'e1', from: 'C', to: 'A' }, { id: 'e2', from: 'B', to: 'C' }]);
    const group = graph.nodes[0]!;
    const originalChildren = [...group.children];
    const originalEdges = graph.toLayoutEdges();
    const active = activateFlatClusters(graph, [{ nodes: ['A', 'B'], arrangement: 'Row',
      padding: 20, vesselId: 'V' }]);
    expect(group.children.map((node) => node.id)).toEqual(['C', 'V']);
    expect(graph.edges.map((edge) => [edge.from.id, edge.to.id])).toEqual([['C', 'V'], ['V', 'C']]);
    active.restore();
    expect(group.children).toEqual(originalChildren);
    expect(graph.toLayoutEdges()).toEqual(originalEdges);
    expect(graph.nodes.map((node) => node.id)).toEqual(['G', 'A', 'B', 'C']);
  });
});
