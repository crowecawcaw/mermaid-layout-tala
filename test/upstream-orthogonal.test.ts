import { Point } from '../src/upstream/geo/point.js';
import { it } from 'vitest';
import fixtures from './fixtures/upstream-orthogonal.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { GoRandom } from '../src/random.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { placeNodesOrthogonally } from '../src/upstream/placement/orthogonal.js';
it.each(fixtures)('matches Go orthogonal placement $trial', (f) => {
  const g = new Graph();
  g.CellSize = 40;
  const nodes = Array.from({ length: f.count }, (_, i) => {
    const n = new Node(BigInt(i + 1), 40, 40);
    g.AddNewNodeToContainer(null, n);
    return n;
  });
  if (f.trial % 7 === 0) nodes[0]!.FixedTopLeft = new Point(20, 35);
  for (let i = 1; i < nodes.length; i++) {
    const e = g.Connect(nodes[f.trial % 3 === 1 ? 0 : i - 1]!, nodes[i]!);
    e.TargetArrowhead = 'triangle';
  }
  const seed = BigInt(f.trial + 1),
    rng = new GoRandom(seed);
  placeNodesOrthogonally(Background, null, g, null, rng, [], seed);
  compare(
    {
      points: nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
      next: String(rng.int63()),
      turn: g.turnCost,
    },
    { points: f.points, next: f.next, turn: f.turn },
  );
});
