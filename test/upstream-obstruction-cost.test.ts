import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { edgeRouteGeometry } from '../src/upstream/placementcost/edge-route-geometry.js';
import { addObstructionCost } from '../src/upstream/placementcost/obstruction-cost.js';

it('charges two turns for an obstructed straight edge and ignores an unplaced obstacle', () => {
  const graph = new Graph(),
    a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20),
    obstacle = new Node(3n, 20, 20);
  for (const node of [a, b, obstacle]) graph.AddNewNodeToContainer(null, node);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(0, 100);
  obstacle.TopLeft = new Point(0, 50);
  graph.turnCost = 7;
  const route = edgeRouteGeometry(a, b, true)!;
  expect(addObstructionCost(Background, a, a, b, route, 10)).toBe(24);
  obstacle.TopLeft = null;
  expect(addObstructionCost(Background, a, a, b, route, 10)).toBe(10);
});
