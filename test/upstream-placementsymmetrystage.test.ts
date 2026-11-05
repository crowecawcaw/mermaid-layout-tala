import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementsymmetrystage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  BalanceSymmetry,
  TransposeAll,
} from '../src/upstream/placement/symmetry-stage.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go symmetry and transpose stages $trial', (f) => {
  const trial = f.trial,
    g = new Graph();
  g.CellSize = 50;
  const n = g.AddNode(new Node(1n, 50, 40));
  n.TopLeft = new Point((trial % 9) * 10 - 40, 0);
  for (let i = 0; i < 2 + (trial % 3); i++) {
    const child = g.AddNode(
      new Node(BigInt(i + 2), 30 + ((i + trial) % 3) * 5, 30),
    );
    child.TopLeft = new Point(i * 100 - 100, 100 + (trial % 3) * 30);
    g.Connect(n, child);
  }
  if (trial % 7 === 0) n.FixedTopLeft = n.TopLeft.Copy();
  let error = '';
  try {
    BalanceSymmetry(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  const after = g.Nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y }));
  if (!error)
    try {
      TransposeAll(Background, g);
    } catch (e) {
      error = (e as Error).message;
    }
  expect(error).toBe(f.error);
  compare(after, f.after);
  compare(
    g.Nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
    f.final,
  );
  compare(g.CellSize, f.cell);
});
