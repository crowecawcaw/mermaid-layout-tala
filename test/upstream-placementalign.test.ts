import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementalign.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  EnsureTransactionWorkGuard,
  NewTransaction,
} from '../src/upstream/layoutgraph/transaction.js';
import { alignAxes, Align } from '../src/upstream/placement/alignment-stage.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go axis alignment stage $trial', (f) => {
  const trial = f.trial,
    g = new Graph();
  g.CellSize = 50;
  const nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30 + i * 5, 25 + i * 4));
    n.TopLeft = new Point(
      (i % 2) * 170 + (trial % 5) * 7,
      Math.trunc(i / 2) * 170 + ((trial * i) % 7) * 8,
    );
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  g.Connect(nodes[0]!, nodes[1]!);
  g.Connect(nodes[1]!, nodes[2]!);
  g.Connect(nodes[2]!, nodes[3]!);
  if (trial % 7 === 0) nodes[0]!.FixedTopLeft = nodes[0]!.TopLeft!.Copy();
  const [ctx] = EnsureTransactionWorkGuard(Background, 'AlignAxesTransactions'),
    txn = NewTransaction(ctx, g, {
      AffectContainers: true,
      IgnoreContainerEscape: false,
      AffectEdgeRoutes: false,
    });
  let changed = false,
    error = '';
  try {
    changed = alignAxes(ctx, g, txn);
  } catch (e) {
    error = (e as Error).message;
  }
  const after = nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y }));
  if (!error)
    try {
      Align(Background, g);
    } catch (e) {
      error = (e as Error).message;
    }
  expect(error).toBe(f.error);
  expect(changed).toBe(f.changed);
  compare(after, f.after);
  compare(
    nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
    f.final,
  );
});
