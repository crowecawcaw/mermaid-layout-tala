import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-enginecompoundroutes.json';
import { Background } from '../src/upstream/limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Position } from '../src/upstream/label/label.js';
import {
  compoundEnclosedRoute,
  PreserveCompoundRoutes,
} from '../src/upstream/engine/compound-routes.js';
it.each(fixtures)('matches Go enclosed compound route $trial', (f) => {
  const g = new Graph(),
    root = new Node(1n, 300, 200);
  root.TopLeft = new Point(0, 0);
  g.AddNewNodeToContainer(null, root);
  const a = new Node(2n, 40, 40);
  a.TopLeft = new Point(20, 60);
  g.AddNewNodeToContainer(root, a);
  const b = new Node(3n, 40, 40);
  b.TopLeft = new Point(220, 60);
  g.AddNewNodeToContainer(root, b);
  const e = g.Connect(a, b);
  e.Points = [
    new Point(60, 80),
    new Point(80 + (f.trial % 25) * 10, 80),
    new Point(220, 80),
  ];
  if (f.trial % 3 === 0) {
    e.Label = new Label();
    e.Label.Text = 'test';
    e.Label.Width = 20;
    e.Label.Height = 10;
    e.Label.Position = Position.InsideMiddleCenter;
    e.LabelPercentage = 0.5;
  }
  if (f.trial % 7 === 0) e.Points[0]!.X = 50;
  const guard = new WorkGuard(Background, 'CompoundRoutes', MaxEngineWorkUnits),
    enclosed = compoundEnclosedRoute(e, guard);
  expect({ enclosed, work: Number(guard.Used()) }).toEqual({
    enclosed: f.enclosed,
    work: f.work,
  });
  const refined = PreserveCompoundRoutes(Background, g, g);
  expect(refined.Nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y])).toEqual(
    f.coords,
  );
  expect(refined.Edges[0]!.Points.map((p) => ({ x: p.X, y: p.Y }))).toEqual(
    f.route,
  );
});
