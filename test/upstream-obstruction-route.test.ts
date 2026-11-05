import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { edgeRouteGeometry } from '../src/upstream/placementcost/edge-route-geometry.js';
import { ObstructionRoute } from '../src/upstream/placementcost/obstruction-route.js';

it('recognizes a blocking node on a straight edge and ignores endpoint descendants', () => {
  const a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20),
    obstacle = new Node(3n, 20, 20);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(0, 100);
  obstacle.TopLeft = new Point(0, 50);
  const route = new ObstructionRoute(a, b, edgeRouteGeometry(a, b, true)!);
  expect(route.bestBlocked(obstacle)).toBe(true);
  obstacle.Container = a;
  expect(route.bestBlocked(obstacle)).toBe(false);
});
