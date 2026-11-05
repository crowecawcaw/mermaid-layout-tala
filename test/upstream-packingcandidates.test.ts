import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingcandidates.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { newWorkGuard } from '../src/upstream/packing/guard.js';
import {
  placementCandidatesGuarded,
  estimateRouteSegments,
  routedEdgeSegments,
  blocksRoutesWithDeltasGuarded,
} from '../src/upstream/packing/candidates.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go packing candidates $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 40, 30));
    n.TopLeft = new Point(
      (i % 2) * 200,
      Math.floor(i / 2) * 150 + (f.trial % 7) * 8,
    );
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  const e = g.Connect(nodes[0]!, nodes[1]!);
  g.Connect(nodes[0]!, nodes[2]!);
  g.Connect(nodes[0]!, nodes[3]!);
  e.Points = [
    new Point(40, 15),
    new Point(100, 15),
    new Point(100, 45),
    new Point(200, 45),
  ];
  const p = (point: Point) => ({ x: point.X, y: point.Y }),
    segment = (s: { Start: Point; End: Point }) => ({
      Start: p(s.Start),
      End: p(s.End),
    });
  let guard = newWorkGuard(Background, 1000000n);
  compare(
    placementCandidatesGuarded(
      nodes,
      null,
      f.trial % 2 === 0,
      f.trial % 3 === 0,
      guard,
    ).map(p),
    f.points,
  );
  expect(Number(guard.Used())).toBe(f.pointWork);
  guard = newWorkGuard(Background, 1000000n);
  const segments = estimateRouteSegments(
    nodes,
    g,
    (f.trial % 5) * 50,
    (f.trial % 6) * 40,
    guard,
  );
  compare(segments.map(segment), f.segments);
  expect(Number(guard.Used())).toBe(f.segmentWork);
  guard = newWorkGuard(Background, 1000000n);
  compare(
    routedEdgeSegments(g.Edges, f.trial % 2 === 0, guard).map(segment),
    f.routes,
  );
  expect(Number(guard.Used())).toBe(f.routedWork);
  guard = newWorkGuard(Background, 1000000n);
  expect(
    blocksRoutesWithDeltasGuarded(
      g,
      nodes.slice(0, 2),
      [nodes.slice(2)],
      segments,
      (f.trial % 5) * 50,
      (f.trial % 6) * 40,
      guard,
    ),
  ).toBe(f.blocked);
  expect(Number(guard.Used())).toBe(f.blockWork);
});
