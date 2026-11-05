import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingbalancegeometry.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import {
  edgeSegmentsGuarded,
  nodeSegmentsGuarded,
  routeSegmentBounds,
  evenlyDistributeGuarded,
  checkBalanceOrder,
} from '../src/upstream/routing/balance-geometry.js';
it.each(fixtures)('matches Go segment balancing geometry $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point(i * 100, (i % 2) * 100);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  for (let i = 0; i < 2; i++) {
    const e = g.Connect(nodes[i]!, nodes[i + 2]!);
    e.Points = [new Point(i * 20, 0), new Point(i * 20, 100)];
  }
  const guard = new RouteWorkGuard(Background, 'BalanceEdgeSegments', 100000n),
    segments = edgeSegmentsGuarded(g.Edges, false, guard),
    locked = nodeSegmentsGuarded(nodes, false, guard),
    [floor, ceil] = routeSegmentBounds(segments[0]!, locked, 10, guard),
    values = evenlyDistributeGuarded(0, 100, f.trial % 6, guard),
    batch = [segments[0]!],
    status = checkBalanceOrder(
      batch,
      new Set(batch),
      segments,
      [(f.trial % 6) * 10],
      true,
      guard,
    );
  expect({ floor, ceil, values, status, work: Number(guard.Used()) }).toEqual({
    floor: f.floor,
    ceil: f.ceil,
    values: f.values,
    status: f.status,
    work: f.work,
  });
});
