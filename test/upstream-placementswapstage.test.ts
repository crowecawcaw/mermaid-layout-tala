import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementswapstage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { swapOptimize, Swap } from '../src/upstream/placement/swap-stage.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go swap stage $trial', (f) => {
  const trial = f.trial,
    g = new Graph();
  g.CellSize = 50;
  const nodes: Node[] = [];
  for (let i = 0; i < 5; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30 + i * 4, 25 + i * 5)),
      j = (i * 2 + trial) % 5;
    n.TopLeft = new Point((j % 3) * 150, Math.trunc(j / 3) * 150);
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  for (let i = 1; i < 5; i++) {
    const e = g.Connect(
      nodes[(trial + i * 3) % 5]!,
      nodes[(trial + i * 3 + 1) % 5]!,
    );
    if (i % 2 === 0) e.TargetArrowhead = 'triangle';
  }
  if (trial % 7 === 0) nodes[0]!.FixedTopLeft = nodes[0]!.TopLeft!.Copy();
  let error = '',
    changed = false;
  try {
    changed = swapOptimize(Background, nodes, g);
  } catch (e) {
    error = (e as Error).message;
  }
  const after = nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y }));
  if (!error)
    try {
      Swap(Background, g);
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
  compare(g.CellSize, f.cell);
});
