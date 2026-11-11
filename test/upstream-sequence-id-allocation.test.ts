import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-sequenceidallocation.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster, Sequence, Tree } from '../src/upstream/layoutgraph/records.js';
import { nextAvailableNodeID } from '../src/upstream/grouping/sequences.js';

it.each(fixtures)('matches Go sequence group ID allocation: $name', (fixture) => {
  const graph = new Graph();
  const node = (id: string) => new Node(BigInt(id), 10, 10);
  for (const id of fixture.active) graph.AddNode(node(id));
  if (fixture.cluster.length) {
    const cluster = new Cluster();
    cluster.Nodes = fixture.cluster.slice(1).map(node);
    graph.Clusters.set(node(fixture.cluster[0]!), cluster);
  }
  if (fixture.sequence.length) {
    const sequence = new Sequence();
    sequence.Nodes = fixture.sequence.slice(1).map(node);
    graph.Sequences.set(node(fixture.sequence[0]!), sequence);
  }
  if (fixture.tree.length)
    graph.Trees.set(node(fixture.tree[0]!), fixture.tree.slice(1).map((id) => new Tree(node(id))));
  expect(String(nextAvailableNodeID(graph, BigInt(fixture.candidate), new Set(fixture.unavailable.map((id) => BigInt(id)))))).toBe(fixture.expected);
});
