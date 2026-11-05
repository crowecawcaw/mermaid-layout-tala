import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsimplify.json';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { SimplifyEdgeRoutes } from '../src/upstream/routing/edge-simplify.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go edge simplification $trial $limit', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 20, 20)),
    b = g.AddNode(new Node(2n, 20, 20)),
    o = g.AddNode(new Node(3n, 10, 10));
  a.TopLeft = new Point(-10, -10);
  b.TopLeft = new Point(60, -30);
  o.TopLeft = new Point(
    20 + (f.trial % 9) * 10,
    -5 + (Math.trunc(f.trial / 9) % 6) * 10,
  );
  if (f.trial % 4 === 0) o.TopLeft = new Point(300, 300);
  const e = g.Connect(a, b);
  e.Points = [
    new Point(10, 0),
    new Point(30, 0),
    new Point(30, 40),
    new Point(70, 40),
    new Point(70, -10),
  ];
  if (f.trial % 3 === 0)
    e.Points = [
      ...e.Points.slice(0, 4),
      new Point(70, 20),
      new Point(90, 20),
      new Point(90, -10),
    ];
  if (f.trial % 5 === 0) {
    const other = g.Connect(a, b);
    other.Points = [new Point(45, -15), new Point(45, 15)];
  }
  if (f.trial % 2 === 1) {
    for (const n of g.Nodes) {
      [n.TopLeft!.X, n.TopLeft!.Y] = [n.TopLeft!.Y, n.TopLeft!.X];
      [n.Width, n.Height] = [n.Height, n.Width];
    }
    for (const edge of g.Edges)
      for (const p of edge.Points) [p.X, p.Y] = [p.Y, p.X];
  }
  const slices = g.Edges.map((x) => x.Points),
    points = g.Edges.map((x) => [...x.Points]);
  let error = '';
  try {
    SimplifyEdgeRoutes(Background, g, BigInt(f.limit));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((x) => x.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
  if (error)
    for (let i = 0; i < g.Edges.length; i++) {
      expect(g.Edges[i]!.Points).toBe(slices[i]);
      for (let j = 0; j < points[i]!.length; j++)
        expect(g.Edges[i]!.Points[j]).toBe(points[i]![j]);
    }
});
