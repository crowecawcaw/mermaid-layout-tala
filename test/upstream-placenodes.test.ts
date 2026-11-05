import { it } from 'vitest';
import fixtures from './fixtures/upstream-placenodes.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { placeNodes } from '../src/upstream/placement/place-nodes.js';
it.each(fixtures)('matches Go recursive placement $trial', (f) => {
  const g = new Graph();
  g.CellSize = 40;
  const nodes = Array.from({ length: f.count }, (_, i) => {
    const n = new Node(BigInt(i + 1), 40 + i * 4, 40 + i * 3);
    g.AddNewNodeToContainer(null, n);
    return n;
  });
  if (f.trial % 7 === 0) nodes[0]!.FixedTopLeft = new Point(20, 35);
  for (const [a, b] of f.edges) {
    const e = g.Connect(nodes[a!]!, nodes[b!]!);
    e.TargetArrowhead = 'triangle';
  }
  placeNodes(Background, g, null, BigInt(f.trial + 1), null, []);
  compare(
    {
      points: nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y, n.Width, n.Height]),
      order: g.Nodes.map((n) => Number(n.ID)),
      cell: g.CellSize,
    },
    { points: f.points, order: f.order, cell: f.cell },
  );
});
