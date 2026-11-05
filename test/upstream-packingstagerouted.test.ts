import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingstagerouted.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { newWorkGuard } from '../src/upstream/packing/guard.js';
import { packAtomic } from '../src/upstream/packing/binpack.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go routed packing stage $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 5; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 40 + i * 5, 30 + (i % 3) * 10));
    n.TopLeft = new Point(
      i * 160 + (f.trial % 11) * 4,
      (i * 97 + f.trial * 13) % 400,
    );
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  if (f.trial % 2 === 0) g.Connect(nodes[0]!, nodes[1]!);
  if (f.trial % 3 === 0) g.Connect(nodes[2]!, nodes[3]!);
  if (f.trial % 5 === 0) nodes[0]!.FixedTopLeft = nodes[0]!.TopLeft!.Copy();
  for (const edge of g.Edges) {
    const a = edge.From!.Center(),
      b = edge.To!.Center();
    edge.Points = [a, new Point(a.X, b.Y), b];
  }
  const guard = newWorkGuard(Background, 10000000n);
  let error = '';
  try {
    packAtomic(Background, g, null, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
    f.points,
  );
  compare(
    g.Edges.map((edge) => edge.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
  expect(Number(guard.Used())).toBe(f.work);
});
