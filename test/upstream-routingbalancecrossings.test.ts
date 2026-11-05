import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingbalancecrossings.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import { BalancedEdgeSegment } from '../src/upstream/routing/balance-geometry.js';
import {
  balanceCollinearOverlap,
  balanceReversalRemovesCrossings,
} from '../src/upstream/routing/balance-crossings.js';

it.each(fixtures)('matches Go balancing crossing decisions $trial', (f) => {
  const g = new Graph();
  const addRoute = (...coords: number[]) => {
    const n = new Node(BigInt(g.Nodes.length + 1), 10, 10);
    n.TopLeft = new Point(1000, g.Nodes.length * 20);
    g.AddNewNodeToContainer(null, n);
    const m = new Node(BigInt(g.Nodes.length + 1), 10, 10);
    m.TopLeft = new Point(1100, n.TopLeft.Y);
    g.AddNewNodeToContainer(null, m);
    const e = g.Connect(n, m);
    for (let i = 0; i < coords.length; i += 2)
      e.Points.push(new Point(coords[i]!, coords[i + 1]!));
    return e;
  };
  const moving = addRoute(10, 0, 10, 20);
  addRoute(0, 5, 20, 5);
  if (f.trial % 3 === 1) addRoute(20, 15, 40, 15);
  if (f.trial % 3 === 2) addRoute(0, 15, 20, 15);
  const segment = new BalancedEdgeSegment(
    moving.Points[0]!,
    moving.Points[1]!,
    moving,
  );
  const guard = new RouteWorkGuard(Background, 'balance', 10000n);
  const accepted = balanceReversalRemovesCrossings(
    g,
    [segment],
    [(f.trial % 5) * 10],
    true,
    guard,
  );
  const overlap = balanceCollinearOverlap(
    new Point(0, 0),
    new Point(0, 20),
    new Point(0, f.trial % 25),
    new Point(0, 30),
  );
  expect({ accepted, overlap, work: Number(guard.Used()) }).toEqual({
    accepted: f.accepted,
    overlap: f.overlap,
    work: f.work,
  });
});
