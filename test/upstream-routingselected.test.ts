import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingselected.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { Route } from '../src/upstream/routing/route.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { finalizeSelectedRoutes } from '../src/upstream/routing/selected-routes.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go selected route commit $trial $limit', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 80, 60));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(200, 0);
  const edges = Array.from({ length: 3 }, () => {
    const e = g.Connect(a, b);
    e.Points = [new Point(-1, -1), new Point(-2, -2)];
    return e;
  });
  const routes = edges.map((edge, i) => {
    const y = 10 + (2 - i) * 20,
      points = [
        [40, 30],
        [80, y],
        [130, y],
        [200, y],
        [240, 30],
      ].map(([x, y]) => new OVGNode(new Point(x!, y!))),
      route = new Route(edge, points);
    route.FromPort = points[1]!.Point.Copy();
    route.ToPort = points[3]!.Point.Copy();
    return route;
  });
  const guard = new RouteSearchWorkGuard(
    Background,
    'Default',
    BigInt(f.limit),
  );
  let error = '';
  try {
    finalizeSelectedRoutes(
      Background,
      g,
      routes,
      null,
      guard,
      f.trial % 2 === 0,
    );
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.Used()).toBe(BigInt(f.work));
  compare(
    edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.paths,
  );
  expect(routes.map((r) => edges.indexOf(r.GEdge))).toEqual(f.routeEdges);
});
