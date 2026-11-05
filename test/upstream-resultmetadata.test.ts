import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-resultmetadata.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Clone } from '../src/upstream/layoutgraph/clone.js';
import { validateLayoutResultMetadata } from '../src/upstream/adapter/result-validation.js';
it.each(fixtures)('matches Go result metadata validation $trial', (f) => {
  const g = new Graph(),
    a = new Node(1n, 40, 30),
    b = new Node(2n, 40, 30);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, 0);
  g.AddNewNodeToContainer(null, a);
  g.AddNewNodeToContainer(null, b);
  g.Directions.set(null, O.Bottom);
  const e = g.Connect(a, b);
  e.ID = 10n;
  e.Points = [new Point(40, 15), new Point(100, 15)];
  e.Label = new Label();
  e.Label.Text = 'edge';
  e.Label.Width = 20;
  e.Label.Height = 10;
  a.Label = new Label();
  a.Label.Text = 'node';
  a.Label.Width = 20;
  a.Label.Height = 10;
  a.FontSize = 16;
  const candidate = Clone(Background, g),
    n = candidate.Nodes[0]!,
    ce = candidate.Edges[0]!;
  switch (f.trial % 16) {
    case 1:
      candidate.IsRootHierarchy = true;
      break;
    case 2:
      candidate.Directions.set(null, O.Top);
      break;
    case 3:
      n.SetShape('Diamond');
      break;
    case 4:
      n.Is3D = true;
      break;
    case 5:
      n.IsMultiple = true;
      break;
    case 6:
      n.IsInvisible = true;
      break;
    case 7:
      n.FixedTopLeft = new Point(1, 2);
      break;
    case 8:
      n.DesiredWidth = 42;
      break;
    case 9:
      n.ForceHierarchy = true;
      break;
    case 10:
      n.Label!.Text = 'changed';
      break;
    case 11:
      n.InitIcon();
      break;
    case 12:
      n.FontSize = 17;
      break;
    case 13:
      ce.TargetArrowhead = 'triangle';
      break;
    case 14:
      ce.MinWidth = 99;
      break;
    case 15:
      ce.Label!.Width = 99;
      break;
  }
  let error = '';
  try {
    validateLayoutResultMetadata(Background, g, candidate, new Set());
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
});
