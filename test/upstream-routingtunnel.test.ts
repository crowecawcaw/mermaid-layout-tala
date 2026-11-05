import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingtunnel.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import {
  tunnelRangesBetween,
  buildTunnels,
} from '../src/upstream/routing/tunnel.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go tunnel construction $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 100, 120)),
    b = g.AddNode(new Node(2n, 100, 120));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(250, (trial % 7) * 20 - 50);
  for (let j = 0; j < trial % 4; j++) {
    const n = g.AddNode(
      new Node(BigInt(j + 3), 20 + j * 15, 20 + ((trial + j) % 7) * 10),
    );
    n.TopLeft = new Point(110 + j * 45, ((trial * 11 + j * 29) % 220) - 70);
  }
  for (let j = 0; j < 1 + (trial % 5); j++) g.Connect(a, b);
  if (trial % 2 === 1)
    for (const n of g.Nodes) {
      [n.TopLeft!.X, n.TopLeft!.Y] = [n.TopLeft!.Y, n.TopLeft!.X];
      [n.Width, n.Height] = [n.Height, n.Width];
    }
  const limits = { ...defaultOVGBuildLimits(), work: BigInt(f.limit) },
    guard = new OVGBuildGuard(Background, limits),
    guard2 = new OVGBuildGuard(Background, limits);
  let ranges: number[][] | null = null,
    horizontal = false,
    error = '';
  try {
    const [r, h] = tunnelRangesBetween(g, a, b, trial % 3 === 0, guard);
    ranges = r?.map((v) => [v.start, v.end]) ?? null;
    horizontal = h;
  } catch (e) {
    error = (e as Error).message;
  }
  let tunnels: { x: number; y: number }[][] | null = null,
    tunnelError = '';
  try {
    tunnels = buildTunnels(g, guard2).map((t) =>
      [t.EntryA.OVGNode.Point, t.EntryB.OVGNode.Point].map((p) => ({
        x: p.X,
        y: p.Y,
      })),
    );
  } catch (e) {
    tunnelError = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(horizontal).toBe(f.horizontal);
  compare(ranges, f.ranges);
  expect(guard.work).toBe(BigInt(f.work));
  expect(tunnelError).toBe(f.tunnelError);
  compare(tunnels, f.tunnels);
  expect(guard2.work).toBe(BigInt(f.tunnelWork));
  expect(guard2.nodes).toBe(BigInt(f.tunnelNodes));
});
