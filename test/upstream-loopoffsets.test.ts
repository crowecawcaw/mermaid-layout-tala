import { it } from 'vitest';
import fixtures from './fixtures/upstream-loopoffsets.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { UpdateOffsets, Route } from '../src/upstream/loops/loops.js';

it.each(fixtures)('matches Go loop offsets and routes $shape $count', (f) => {
  const graph = new Graph(),
    node = new Node(1n, 80.5, 50.25);
  graph.AddNode(node);
  node.SetShape(f.shape);
  if (f.count % 2 === 1) node.TopLeft = new Point(10, 20);
  for (let i = 0; i < f.count; i++) {
    const e = graph.Connect(node, node);
    if (i % 2 === 0) e.TargetArrowhead = 'triangle';
    else e.SourceArrowhead = 'triangle';
    if (i % 3 === 1) {
      e.Label = new Label();
      e.Label.Width = 20 + i * 2;
      e.Label.Height = 10 + i;
    }
  }
  UpdateOffsets(node);
  compare(Object.fromEntries(node.LoopOffsets), f.offsets);
  compare(node.TopLeft === null, f.wasNil);
  node.TopLeft = new Point(10, 20);
  const routes = Route(node).map((e) => e.Points.map((p) => [p.X, p.Y]));
  compare(routes, f.routes);
});
