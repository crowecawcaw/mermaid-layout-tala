import { Place } from '../src/upstream/placement/place.js';
import { it } from 'vitest';
import fixtures from './fixtures/upstream-placenested.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { placeNodes } from '../src/upstream/placement/place-nodes.js';
it.each(fixtures)('matches Go nested placement $trial', (f) => {
  const g = new Graph();
  g.CellSize = 40;
  const root = new Node(1n, 120, 100),
    a = new Node(2n, 40, 40),
    b = new Node(3n, 45, 35),
    external = new Node(4n, 50, 40);
  g.AddNewNodeToContainer(null, root);
  g.AddNewNodeToContainer(root, a);
  g.AddNewNodeToContainer(root, b);
  g.AddNewNodeToContainer(null, external);
  if (f.trial % 5 === 0) root.FixedTopLeft = new Point(20, 35);
  const edges = [g.Connect(a, b), g.Connect(b, external)];
  if (f.trial % 3 === 0) edges.push(g.Connect(a, external));
  for (const e of edges) e.TargetArrowhead = 'triangle';
  placeNodes(Background, g, null, BigInt(f.trial + 1), null, []);
  compare(
    {
      points: [root, a, b, external].map((n) => [
        n.TopLeft!.X,
        n.TopLeft!.Y,
        n.Width,
        n.Height,
      ]),
      order: g.Nodes.map((n) => Number(n.ID)),
      endpoints: g.Edges.map((e) => [Number(e.From.ID), Number(e.To.ID)]),
      cell: g.CellSize,
    },
    { points: f.points, order: f.order, endpoints: f.endpoints, cell: f.cell },
  );
  Place(Background, g, BigInt(f.trial + 1));
  compare(
    {
      points: [root, a, b, external].map((n) => [
        n.TopLeft!.X,
        n.TopLeft!.Y,
        n.Width,
        n.Height,
      ]),
      cell: g.CellSize,
    },
    { points: f.placed, cell: f.placedCell },
  );
});
