import { it } from 'vitest';
import fixtures from './fixtures/upstream-placementstages.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import {
  Prescale,
  Pad,
  Normalize,
} from '../src/upstream/placement/basic-stages.js';

it.each(fixtures)('matches Go prescaling and normalization $trial', (f) => {
  const g = new Graph();
  const nodes = Array.from({ length: 3 }, (_, j) => {
    const n = new Node(
      BigInt(j + 1),
      20 + (f.trial % 50) + j * 7,
      30 + (f.trial % 30) + j * 5,
    );
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(j * 100 - f.trial, j * 40 + f.trial);
    return n;
  });
  nodes[0]!.SetShape(f.shape);
  nodes[0]!.FontSize = [13, 14, 16, 20, 24, 28, 32][f.trial % 7]!;
  if (f.trial % 9 === 0) nodes[0]!.FixedTopLeft = new Point(0, 0);
  for (let j = 0; j < f.trial % 9; j++)
    g.Connect(nodes[0]!, f.trial % 11 === 0 ? nodes[0]! : nodes[1 + (j % 2)]!);
  Prescale(g);
  compare(
    nodes.map((n) => [n.Width, n.Height]),
    f.dims,
  );
  compare(nodes[0]!.FontSize, f.font);
  Pad(g);
  Normalize(g);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.positions,
  );
});
