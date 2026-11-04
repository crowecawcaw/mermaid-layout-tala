import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { edgeRouteGeometry } from '../src/upstream/placementcost/edge-route-geometry.js';
import { edgeDistance } from '../src/upstream/placementcost/edge-distance.js';

it('adds the container alignment penalty once even when both axes are misaligned', () => {
  const graph = new Graph(),
    a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20);
  graph.AddNodeUnchecked(a);
  graph.AddNodeUnchecked(b);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(30, 30);
  const edge = graph.Connect(a, b),
    route = edgeRouteGeometry(a, b, true)!;
  graph.turnCost = 10;
  const base = edgeDistance(a, b, edge, a, b, true, route);
  a.isContainer = true;
  b.isContainer = true;
  expect(edgeDistance(a, b, edge, a, b, true, route)).toBe(base + 10);
});
