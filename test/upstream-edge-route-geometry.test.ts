import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { edgeRouteGeometry } from '../src/upstream/placementcost/edge-route-geometry.js';
import { Orientation } from '../src/upstream/geo/orientation.js';

it('uses facing boundaries for straight routes and centers for diagonal routes', () => {
  const a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(0, 50);
  const straight = edgeRouteGeometry(a, b, true)!;
  expect(straight.direction).toBe(Orientation.Top);
  expect(straight.nodeVal).toEqual(new Point(10, 20));
  expect(straight.adjacentNodeVal).toEqual(new Point(10, 50));
  b.TopLeft = new Point(50, 50);
  const diagonal = edgeRouteGeometry(a, b, true)!;
  expect(diagonal.isDiagonal).toBe(true);
  expect(diagonal.nodeVal).toEqual(new Point(10, 10));
  expect(diagonal.adjacentNodeVal).toEqual(new Point(60, 60));
  expect(edgeRouteGeometry(a, b, false)!.nodeVal).toBe(a.TopLeft);
});
