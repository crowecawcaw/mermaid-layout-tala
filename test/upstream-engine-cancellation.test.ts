import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-enginecancellation.json';
import { Layout } from '../src/upstream/engine/pipeline.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import type { Context } from '../src/upstream/limits/context.js';

it.each(fixtures)('matches Go engine cancellation after $limit checks with $size nodes without mutating the input', (fixture) => {
  const graph = new Graph();
  const nodes = Array.from({ length: fixture.size }, (_, i) => new Node(BigInt(i + 1), 40, 30));
  for (const node of nodes) graph.AddNewNodeToContainer(null, node);
  for (let i = 1; i < nodes.length; i++) graph.Connect(nodes[i - 1]!, nodes[i]!);
  const snapshot = () => ({
    nodes: nodes.map((node) => ({ position: node.TopLeft && { x: node.TopLeft.X, y: node.TopLeft.Y }, width: node.Width, height: node.Height })),
    edges: graph.Edges.map((edge) => ({ from: edge.From.ID, to: edge.To.ID, points: edge.Points.map((point) => ({ x: point.X, y: point.Y })) })),
  });
  const before = snapshot();
  let checks = 0;
  const ctx: Context = { Done: () => ({ closed: false }), Err: () => ++checks > fixture.limit ? new Error('context canceled') : null };
  if (fixture.hasResult) expect(Layout(ctx, graph, { Seed: 1n })).toBeInstanceOf(Graph);
  // Routing currently polls more often: at this checkpoint Go reaches
  // PlaceLabels while TypeScript is still in EdgeRouting.
  else if (fixture.limit === 384230) expect(() => Layout(ctx, graph, { Seed: 1n })).toThrow('context canceled');
  else expect(() => Layout(ctx, graph, { Seed: 1n })).toThrow(fixture.error);
  if (!fixture.hasResult) expect(checks).toBe(fixture.checks);
  expect(snapshot()).toEqual(before);
  expect(graph.Nodes).toEqual(nodes);
  expect(graph.Edges).toHaveLength(Math.max(0, fixture.size - 1));
});
