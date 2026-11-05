import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingcosts.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { Route } from '../src/upstream/routing/route.js';
import {
  RouteSearchWorkGuard,
  fixedOverlapsForRoute,
} from '../src/upstream/routing/search-guard.js';
import { positionedArrowheadLabelCostGuarded } from '../src/upstream/routing/search-costs.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go route search cost helpers $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30, 30));
    n.TopLeft = new Point(
      (trial * 7 + i * 31) % 110,
      (trial * 11 + i * 23) % 100,
    );
    if ((i + trial) % 4 === 0) n.FixedTopLeft = n.TopLeft.Copy();
    nodes.push(n);
  }
  const e = g.Connect(nodes[0]!, nodes[1]!),
    other = g.Connect(nodes[2]!, nodes[3]!);
  other.Points = [new Point(10, 10), new Point(100, 10), new Point(100, 80)];
  const positioned = {
      Box: new Box(new Point((trial % 8) * 10, (trial % 7) * 10), 20, 15),
      Edge: e,
      IsTarget: false,
      Text: 'x',
    },
    labels =
      trial % 4 === 0
        ? [
            {
              Box: new Box(new Point(30, 30), 20, 20),
              Edge: other,
              IsTarget: false,
              Text: 'y',
            },
          ]
        : [],
    route = new Route(other, [
      new OVGNode(new Point(20, 20)),
      new OVGNode(new Point(20, 100)),
    ]);
  const guard = new RouteSearchWorkGuard(Background, 'Default', 10000n),
    value = positionedArrowheadLabelCostGuarded(
      positioned,
      nodes,
      labels,
      [route],
      [other],
      guard,
    ),
    guard2 = new RouteSearchWorkGuard(Background, 'Default', 10000n),
    overlaps = fixedOverlapsForRoute(nodes, guard2);
  compare(Number.isFinite(value) ? value : -1, f.cost);
  expect(guard.Used()).toBe(BigInt(f.work));
  expect(nodes.map((n) => overlaps.has(n))).toEqual(f.overlap);
  expect(guard2.Used()).toBe(BigInt(f.overlapWork));
});
