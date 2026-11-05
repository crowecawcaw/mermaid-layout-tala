import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routeinventory.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { Route } from '../src/upstream/routing/route.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { RouteInventory } from '../src/upstream/routing/route-inventory.js';
it.each(fixtures)('matches Go route inventory $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 20, 20)),
    b = g.AddNode(new Node(2n, 20, 20));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, 0);
  const ovg = new OVG(g.Nodes),
    nodes: OVGNode[] = [];
  for (let i = 0; i < 12; i++) {
    const n = ovg.AddNode(
      new OVGNode(new Point((i % 6) * 20, Math.trunc(i / 6) * 4)),
    );
    n.Index = i;
    nodes.push(n);
  }
  for (let i = 0; i < 12; i++) {
    if (i % 6 !== 5) ovg.Connect(nodes[i]!, nodes[i + 1]!);
    if (i < 6) ovg.Connect(nodes[i]!, nodes[i + 6]!);
  }
  const guard = new RouteSearchWorkGuard(Background, 'Default', 100000n),
    inventory = new RouteInventory(ovg, guard),
    routes: Route[] = [];
  for (let j = 0; j < 2; j++) {
    const e = g.Connect(a, b);
    e.IsInvisible = (trial + j) % 5 === 0;
    const start = ((trial + j) % 2) * 6,
      route = new Route(e, nodes.slice(start, start + 5));
    inventory.addRoute(route);
    routes.push(route);
  }
  const found = (
      inventory.findOverlappingRoutes(nodes[1]!, nodes[3]!) ?? []
    ).map((r) => routes.indexOf(r)),
    flags = ovg.Edges.map((e) => ({
      near: inventory.hasNearbyEdge.has(e),
      overlaps: inventory.overlappingRoutes.get(e)?.length ?? 0,
    }));
  expect(found).toEqual(f.found);
  expect(flags).toEqual(f.flags);
  expect(guard.Used()).toBe(BigInt(f.work));
});
