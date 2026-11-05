import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routeports.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import {
  addPorts,
  connectPortsToCenter,
} from '../src/upstream/routing/ovg-ports.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { RouteInventory } from '../src/upstream/routing/route-inventory.js';
import { Route } from '../src/upstream/routing/route.js';
import {
  usedPorts,
  centerSymmetricalPorts,
} from '../src/upstream/routing/route-ports.js';
it.each(fixtures)('matches Go used and symmetrical ports $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 80, 60));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(200, 0);
  const ovg = new OVG(g.Nodes),
    setup = new OVGBuildGuard(Background, defaultOVGBuildLimits());
  addPorts(ovg, g, setup);
  connectPortsToCenter(ovg, setup);
  const inventory = new RouteInventory(
    ovg,
    new RouteSearchWorkGuard(Background, 'Default', 100000n),
  );
  for (let i = 0; i < trial % 5; i++) {
    const e = g.Connect(a, b),
      pa = ovg.Ports.get(a)![(trial + i) % ovg.Ports.get(a)!.length]!,
      pb = ovg.Ports.get(b)![(trial * 3 + i) % ovg.Ports.get(b)!.length]!,
      route = new Route(e, [ovg.Centers.get(a)!, pa, pb, ovg.Centers.get(b)!]);
    route.FromPort = pa.Point.Copy();
    route.ToPort = pb.Point.Copy();
    inventory.addRoute(route);
  }
  const guard = new RouteSearchWorkGuard(Background, 'Default', 100000n),
    u = usedPorts(
      Background,
      ovg,
      inventory,
      a,
      b,
      ovg.Centers.get(a)!,
      ovg.Centers.get(b)!,
      new Set([a]),
      new Set([b]),
      false,
      guard,
    ),
    sym = centerSymmetricalPorts(
      Background,
      ovg,
      a,
      b,
      u.source,
      u.target,
      guard,
    );
  const maps = [
    u.source,
    u.target,
    u.duplicateSource,
    u.duplicateTarget,
    u.sharedClusterSource,
    u.sharedClusterTarget,
  ].map((map) =>
    map
      .entries()
      .map(([p]) => `${p.X},${p.Y}`)
      .sort(),
  );
  expect(maps).toEqual(f.maps);
  expect(ovg.Nodes.flatMap((p, i) => (sym.has(p) ? [i] : []))).toEqual(f.sym);
  expect(guard.Used()).toBe(BigInt(f.work));
});
