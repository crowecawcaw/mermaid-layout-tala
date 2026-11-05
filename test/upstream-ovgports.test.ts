import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgports.json';
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
  addTunnels,
  connectPortsToCenter,
} from '../src/upstream/routing/ovg-ports.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go visibility ports $shape $trial $limit', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 100, 120)),
    b = g.AddNode(new Node(2n, 100, 120));
  a.TopLeft = new Point(0, 0);
  a.SetShape(f.shape);
  b.TopLeft = new Point((f.trial % 2) * 100, 0);
  b.SetShape(f.shape);
  b.IsInvisible = f.trial % 3 === 0;
  for (let i = 0; i < 1 + (f.trial % 3); i++) g.Connect(a, b);
  const ovg = new OVG(g.Nodes),
    guard = new OVGBuildGuard(Background, {
      ...defaultOVGBuildLimits(),
      work: BigInt(f.limit),
    });
  let error = '';
  try {
    addPorts(ovg, g, guard);
    addTunnels(ovg, g, guard);
    connectPortsToCenter(ovg, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  const ids = new Map(ovg.Nodes.map((n, i) => [n, i]));
  const nodes = ovg.Nodes.map((n) => ({
    point: { x: n.X, y: n.Y },
    center: n.IsNodeCenter,
    tunnel: n.IsTunnel,
    a: n.isPortOf(a),
    b: n.isPortOf(b),
    aDirs: n.portDirectionsForObstacle(a),
    bDirs: n.portDirectionsForObstacle(b),
    aCenter: n.isCenterPortOf(a),
    bCenter: n.isCenterPortOf(b),
  }));
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  compare(nodes, f.nodes);
  expect(
    [a, b].map((n) => (ovg.Ports.get(n) ?? []).map((p) => ids.get(p) ?? 0)),
  ).toEqual(f.ports);
  expect(ovg.Edges.map((e) => [ids.get(e.From), ids.get(e.To)])).toEqual(
    f.edges,
  );
});
