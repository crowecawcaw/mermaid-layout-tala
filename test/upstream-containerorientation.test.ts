import { it } from 'vitest';
import fixtures from './fixtures/upstream-containerorientation.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { orientSourceInterior } from '../src/upstream/placement/container-orientation.js';
it.each(fixtures)('matches Go interior orientation $trial', (f) => {
  const g = new Graph(),
    root = new Node(1n, 30000, 30000);
  root.TopLeft = new Point(0, 0);
  root.isContainer = true;
  g.AddNewNodeToContainer(null, root);
  g.Directions.set(null, f.direction);
  const nodes = Array.from({ length: 3 }, (_, i) => {
    const n = new Node(BigInt(i + 2), 100, 60);
    n.TopLeft =
      f.trial % 8 >= 4 ? new Point(0, i * 400) : new Point(i * 400, 0);
    g.AddNewNodeToContainer(root, n);
    return n;
  });
  for (let i = 1; i < nodes.length; i++) {
    const e = g.Connect(nodes[i - 1]!, nodes[i]!);
    if (f.reverse) e.SourceArrowhead = 'triangle';
    else e.TargetArrowhead = 'triangle';
  }
  const internal = [...g.Edges];
  for (let i = 0; i < 3; i++) {
    const n = new Node(BigInt(100 + i), 100, 60);
    n.TopLeft = new Point(40000 + i * 200, 40000);
    g.AddNewNodeToContainer(null, n);
    const e = g.Connect(root, n);
    e.TargetArrowhead = 'triangle';
  }
  g.Nodes = nodes;
  g.Edges = internal;
  g.CellSize = 100;
  if (f.trial % 11 === 0) nodes[0]!.FixedTopLeft = nodes[0]!.TopLeft!.Copy();
  orientSourceInterior(Background, g, root, []);
  compare(
    {
      positions: nodes.map((n) => [
        n.TopLeft!.X,
        n.TopLeft!.Y,
        n.Width,
        n.Height,
      ]),
      cell: g.CellSize,
      root: [root.Width, root.Height],
    },
    { positions: f.positions, cell: f.cell, root: f.root },
  );
});
