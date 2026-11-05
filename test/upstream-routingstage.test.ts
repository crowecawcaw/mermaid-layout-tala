import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingstage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { TraceEdgesToShapeBorder } from '../src/upstream/routing/trace.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go route stage work limit $count $limit', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < f.count + 1; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 80, 60));
    n.SetShape('Diamond');
    n.TopLeft = new Point(i * 150, i * 100);
    nodes.push(n);
  }
  for (let i = 0; i < f.count; i++) {
    const e = g.Connect(nodes[i]!, nodes[i + 1]!);
    e.Points = [
      new Point(i * 150 + 80, i * 100 + 30),
      new Point(i * 150 + 100, i * 100 + 30),
      new Point((i + 1) * 150, (i + 1) * 100 + 30),
    ];
  }
  const slices = g.Edges.map((e) => e.Points),
    points = g.Edges.map((e) => [...e.Points]);
  let error = '';
  try {
    TraceEdgesToShapeBorder(Background, g, BigInt(f.limit));
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
  if (error)
    for (let i = 0; i < g.Edges.length; i++) {
      expect(g.Edges[i]!.Points).toBe(slices[i]);
      for (let j = 0; j < points[i]!.length; j++)
        expect(g.Edges[i]!.Points[j]).toBe(points[i]![j]);
    }
});
