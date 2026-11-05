import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-resultvalidation.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { validateCompletedGraph } from '../src/upstream/adapter/result-validation.js';
it.each(fixtures)('matches Go result validation $trial', (f) => {
  const g = new Graph(),
    a = new Node(1n, 40, 30),
    b = new Node(2n, 40, 30);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, 0);
  g.AddNewNodeToContainer(null, a);
  g.AddNewNodeToContainer(null, b);
  const e = g.Connect(a, b);
  e.ID = 10n;
  e.Points = [new Point(40, 15), new Point(100, 15)];
  switch (f.trial % 10) {
    case 1:
      a.TopLeft = null;
      break;
    case 2:
      a.Width = 0;
      break;
    case 3:
      a.TopLeft!.X = 1000000001;
      break;
    case 4:
      b.ID = 1n;
      break;
    case 5:
      e.Points = [];
      break;
    case 6:
      e.Points[1] = null!;
      break;
    case 7:
      e.LabelPercentage = 2;
      break;
    case 8:
      e.Label = new Label();
      e.Label.Width = -1;
      e.Label.Height = 5;
      break;
    case 9:
      g.Edges.push(e);
      break;
  }
  let error = '';
  try {
    validateCompletedGraph(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
});
