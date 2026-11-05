import { it } from 'vitest';
import fixtures from './fixtures/upstream-transpose.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { transpose } from '../src/upstream/placement/transpose.js';
it.each(fixtures)('matches Go transpose $trial', (f) => {
  const g = new Graph();
  g.CellSize = 60;
  const positions = [
    [100, 100],
    [250, 100],
    [250, 250],
    [400, 100],
  ];
  if (f.trial % 3 === 0) positions[2] = [400, 100];
  const nodes = positions.map(([x, y], i) => {
    const n = new Node(BigInt(i + 1), 40, 40);
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(x! + (f.trial % 5), y!);
    return n;
  });
  for (let i = 1; i < 4; i++) {
    const e = g.Connect(nodes[0]!, nodes[i]!);
    e.TargetArrowhead = 'triangle';
  }
  if (f.trial % 7 === 0) nodes[1]!.FixedTopLeft = new Point(1, 1);
  const changed = transpose(
    Background,
    g,
    nodes[1]!,
    f.trial % 2 === 1 ? [] : null,
  );
  compare(
    { changed, positions: nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]) },
    { changed: f.changed, positions: f.positions },
  );
});
