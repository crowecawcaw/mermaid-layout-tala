import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routinggraph.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteGraph } from '../src/upstream/routing/graph-stage.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go whole-graph routing $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50)),
    c = g.AddNode(new Node(3n, 30, 30));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(150 + (trial % 3) * 30, (trial % 5) * 50 - 100);
  c.TopLeft = new Point(100 + (trial % 4) * 30, 200);
  for (let i = 0; i < 1 + (trial % 3); i++) {
    const e = g.Connect(a, b);
    if (trial % 2 === 0) e.TargetArrowhead = 'triangle';
    if (trial % 4 === 0)
      e.Points = [new Point(80, 10 + i * 15), new Point(150, 10 + i * 15)];
  }
  const opts = {
    ForceReroute: trial % 8 === 0,
    RoutesPreviouslyCompleted: trial % 4 === 0,
  };
  let complete = opts.RoutesPreviouslyCompleted,
    error = '';
  try {
    complete = RouteGraph(Background, g, opts, BigInt(f.limit));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  if (!error) expect(complete).toBe(f.complete);
  compare(
    g.Edges.map((e) =>
      e.Points.map((p) => ({ x: p.X, y: p.Y })),
    ),
    f.routes,
  );
  expect(g.Nodes.map((n) => n.Graph === g)).toEqual(f.owners);
});
