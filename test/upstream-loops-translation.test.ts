import { it } from 'vitest';
import fixtures from './fixtures/upstream-loops.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Route } from '../src/upstream/loops/loops.js';

it.each(fixtures)('matches Go translated loops $name', (f) => {
  const graph = new Graph(),
    node = new Node(1n, f.node.width, f.node.height);
  graph.AddNodeUnchecked(node);
  node.TopLeft = new Point(10, 20);
  const edges = f.edges.map((e) => {
    const edge = graph.Connect(node, node);
    edge.SourceArrowhead = e.sourceArrowhead;
    edge.TargetArrowhead = e.targetArrowhead;
    if ('labelWidth' in e) {
      edge.Label = new Label();
      edge.Label.Width = e.labelWidth!;
      edge.Label.Height = e.labelHeight!;
    }
    return edge;
  });
  Route(node);
  const actual: Record<string, { x: number; y: number }[]> = {};
  edges.forEach((e, i) => {
    actual[String(i)] = e.Points.map((p) => ({ x: p.X, y: p.Y }));
  });
  compare(actual, f.expected);
});
