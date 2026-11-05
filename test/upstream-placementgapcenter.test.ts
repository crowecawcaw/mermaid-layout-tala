import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementgapcenter.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Equidistance } from '../src/upstream/placement/equidistance.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go equidistance stage $trial', (f) => {
  const trial = f.trial,
    g = new Graph();
  g.CellSize = 50;
  const positions = [
      new Point(0, 0),
      new Point(100 + (trial % 7) * 15, 0),
      new Point(300 + (trial % 5) * 20, 0),
      new Point(100 + (trial % 7) * 15, 150),
    ],
    nodes = positions.map((p, i) => {
      const n = g.AddNode(new Node(BigInt(i + 1), 40, 30));
      n.TopLeft = p;
      return n;
    });
  g.Containers.set(null, nodes);
  g.Connect(nodes[0]!, nodes[1]!);
  g.Connect(nodes[1]!, nodes[2]!);
  if (trial % 2 === 0) g.Connect(nodes[1]!, nodes[3]!);
  if (trial % 7 === 0) nodes[1]!.FixedTopLeft = nodes[1]!.TopLeft!.Copy();
  if (trial % 3 === 0)
    for (const n of nodes) {
      [n.TopLeft!.X, n.TopLeft!.Y] = [n.TopLeft!.Y, n.TopLeft!.X];
      [n.Width, n.Height] = [n.Height, n.Width];
    }
  let changed = false,
    error = '';
  try {
    changed = Equidistance(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(changed).toBe(f.changed);
  compare(
    nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
    f.points,
  );
});
