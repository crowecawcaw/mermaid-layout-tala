import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingnestedroutes.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { newWorkGuard } from '../src/upstream/packing/guard.js';
import { packAtomic } from '../src/upstream/packing/binpack.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go nested routed packing stage $trial', (f) => {
  const g = new Graph(),
    root = new Node(1n, 800, 600);
  root.isContainer = true;
  root.TopLeft = new Point(0, 0);
  g.AddNewNodeToContainer(null, root);
  const nodes = [root];
  for (let i = 0; i < 4; i++) {
    const n = new Node(BigInt(i + 2), 40, 30);
    n.TopLeft = new Point(
      100 + i * 140 + (f.trial % 7) * 4,
      100 + ((i * 83 + f.trial * 9) % 300),
    );
    g.AddNewNodeToContainer(root, n);
    nodes.push(n);
  }
  const ext = new Node(6n, 40, 30);
  ext.TopLeft = new Point(1000, 200);
  g.AddNewNodeToContainer(null, ext);
  nodes.push(ext);
  if (f.trial % 2 === 0) g.Connect(nodes[1]!, nodes[2]!);
  if (f.trial % 3 === 0) g.Connect(nodes[3]!, ext);
  if (f.trial % 5 === 0) nodes[2]!.FixedTopLeft = nodes[2]!.TopLeft!.Copy();
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
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y, n.Width, n.Height]),
    f.geometry,
  );
  compare(
    g.Edges.map((edge) => edge.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
  expect(Number(guard.Used())).toBe(f.work);
});
