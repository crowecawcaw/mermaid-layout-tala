import { expect, it } from 'vitest';
import fixture from './fixtures/upstream-enginefallbacksnapshot.json';
import { Pipeline } from '../src/upstream/engine/pipeline.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import type { Context } from '../src/upstream/limits/context.js';
import { compare } from './helpers/compare.js';

it('matches the upstream graph entering and leaving straight fallback', () => {
  const graph = new Graph();
  const nodes = Array.from({ length: 6 }, (_, i) => new Node(BigInt(i + 1), 40, 30));
  for (const node of nodes) graph.AddNewNodeToContainer(null, node);
  for (let i = 1; i < nodes.length; i++) graph.Connect(nodes[i - 1]!, nodes[i]!);
  let checks = 0;
  const ctx: Context = { Done: () => ({ closed: false }), Err: () => { checks++; return null; } };
  const snapshot = () => ({
    nodes: graph.Nodes.map((n) => ({ id: Number(n.ID), topLeft: n.TopLeft && { x: n.TopLeft.X, y: n.TopLeft.Y }, width: n.Width, height: n.Height })),
    edges: graph.Edges.map((e) => ({ id: Number(e.ID), from: Number(e.From.ID), to: Number(e.To.ID), points: e.Points.map((p) => ({ x: p.X, y: p.Y })) })),
  });
  const pipeline = new Pipeline(graph, 1n);
  let before: ReturnType<typeof snapshot> | undefined, after: ReturnType<typeof snapshot> | undefined;
  let beforeChecks = 0, afterChecks = 0;
  pipeline.stages = pipeline.stages.map((stage) => stage.name !== 'StraightEdgesFallback' ? stage : ({ ...stage, run: (p, c) => {
    before = snapshot(); beforeChecks = checks;
    stage.run(p, c);
    after = snapshot(); afterChecks = checks;
  } }));
  const counts: {name: string; before: number; after: number}[] = [];
  pipeline.stages = pipeline.stages.map((stage) => ({ ...stage, run: (p, c) => {
    const start = checks;
    stage.run(p, c);
    counts.push({ name: stage.name, before: start, after: checks });
  } }));
  pipeline.runAllStages(ctx);
  compare(before, fixture.before);
  compare(after, fixture.after);
  expect(counts).toEqual(fixture.counts);
  expect(beforeChecks).toBe(fixture.beforeChecks);
  expect(afterChecks).toBe(fixture.afterChecks);
});
