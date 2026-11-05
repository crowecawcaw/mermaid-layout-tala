import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingmulti.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import { Route } from '../src/upstream/routing/route.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go multi-edge route search $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
  const edges = [];
  for (let i = 0; i < 2 + (trial % 2); i++) {
    const e = trial % 4 === 0 && i === 1 ? g.Connect(b, a) : g.Connect(a, b);
    if (trial % 2 === 0) e.TargetArrowhead = 'triangle';
    edges.push(e);
  }
  const ovg = buildOVGFromGraphWithLimits(Background, g, []),
    router = new OVGEdgeRouter(Background, 'Default', ovg, g, [], edges),
    outputs = [];
  for (const edge of edges) {
    let points: { x: number; y: number }[] | null = null,
      cost = 0,
      error = '';
    try {
      const [path, c] = router.search(Background, edge);
      cost = c;
      points = path.map((n) => ({ x: n.X, y: n.Y }));
      const route = new Route(edge, path);
      route.FromPort = path[1]!.Point.Copy();
      route.ToPort = path[path.length - 2]!.Point.Copy();
      router.inventory.addRoute(route);
    } catch (e) {
      error = (e as Error).message;
    }
    outputs.push({ error, points, cost });
    if (error) break;
  }
  expect(outputs.length).toBe(f.outputs.length);
  for (let i = 0; i < outputs.length; i++) {
    expect(outputs[i]!.error).toBe(f.outputs[i]!.error);
    compare(outputs[i]!.points, f.outputs[i]!.points);
    compare(outputs[i]!.cost, f.outputs[i]!.cost);
  }
});
