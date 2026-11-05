import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingguard.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  newWorkGuard,
  binPackScoreGuarded,
  binPackSmallestDeltas,
  binPackReverseDFSWalk,
  binPackMoveNodeWithChildren,
} from '../src/upstream/packing/guard.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go packing guard helpers $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30 + i * 10, 25 + i * 5));
    n.TopLeft = new Point(
      i * 110 + (f.trial % 11),
      (i * 47 + f.trial * 3) % 160,
    );
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  const root = new Node(10n, 500, 500);
  root.TopLeft = new Point(0, 0);
  const desired = 450 + (f.trial % 9) * 20;
  if (f.trial % 3 === 0) root.DesiredWidth = desired;
  else if (f.trial % 3 === 1) root.DesiredHeight = desired;
  let guard = newWorkGuard(Background, 1000000n);
  expect(binPackScoreGuarded(nodes, root, guard)).toBe(f.score);
  expect(Number(guard.Used())).toBe(f.scoreWork);
  guard = newWorkGuard(Background, 1000000n);
  const [x, y] = binPackSmallestDeltas(
    [nodes.slice(0, 2), nodes.slice(2)],
    guard,
  );
  expect([x, y, Number(guard.Used())]).toEqual([
    f.smallX,
    f.smallY,
    f.smallWork,
  ]);
  guard = newWorkGuard(Background, 1000000n);
  const order: number[] = [];
  binPackReverseDFSWalk(nodes[0]!, (n) => order.push(Number(n.ID)), guard);
  expect(order).toEqual(f.order);
  expect(Number(guard.Used())).toBe(f.walkWork);
  guard = newWorkGuard(Background, 1000000n);
  binPackMoveNodeWithChildren(nodes[0]!, f.trial % 4, f.trial % 5, guard);
  compare({ x: nodes[0]!.TopLeft!.X, y: nodes[0]!.TopLeft!.Y }, f.moved);
  expect(Number(guard.Used())).toBe(f.moveWork);
});
