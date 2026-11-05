import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-enginepipeline.json';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Layout } from '../src/upstream/engine/pipeline.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go engine pipeline $trial', (f) => {
  const g = new Graph(),
    count = 1 + (f.trial % 4);
  for (let i = 0; i < count; i++)
    g.AddNewNodeToContainer(
      null,
      new Node(BigInt(i + 1), 40 + i * 10, 30 + i * 5),
    );
  for (let i = 0; i < count - 1; i++) g.Connect(g.Nodes[i]!, g.Nodes[i + 1]!);
  if (f.trial % 3 === 2 && count > 2)
    g.Connect(g.Nodes[0]!, g.Nodes[count - 1]!);
  let error = '',
    nodes: unknown[] = [],
    routes: unknown[] = [];
  try {
    const result = Layout(Background, g, { Seed: BigInt(f.trial % 3) });
    nodes = result.Nodes.map((n) => ({
      id: Number(n.ID),
      x: n.TopLeft!.X,
      y: n.TopLeft!.Y,
      width: n.Width,
      height: n.Height,
    }));
    routes = result.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y })));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(nodes, f.nodes);
  compare(routes, f.routes);
});
