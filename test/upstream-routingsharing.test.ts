import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsharing.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import {
  edgeCanOverlapEdgesGuarded,
  overlappingEdgesGuarded,
  routeIntersectsNodeGuarded,
} from '../src/upstream/routing/route-sharing.js';
it.each(fixtures)('matches Go route sharing $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 20, 20));
    n.TopLeft = new Point(i * 30, (i % 2) * 30);
    nodes.push(n);
  }
  const arrows = ['', 'none', 'triangle', 'diamond'],
    all = [];
  for (let i = 0; i < 5; i++) {
    const e = g.Connect(
      nodes[(trial + i * 3) % 6]!,
      nodes[(Math.trunc(trial / 3) + i * 5 + 1) % 6]!,
    );
    e.SourceArrowhead = arrows[(trial + i) % 4]!;
    e.TargetArrowhead = arrows[(Math.trunc(trial / 4) + i * 3) % 4]!;
    if ((trial + i) % 19 === 0) e.SourceArrowheadLabel = new Label();
    e.Points = [
      new Point(((trial + i) % 7) * 10, (i % 3) * 10),
      new Point(((trial + i) % 7) * 10, (i % 3) * 10 + 30),
    ];
    all.push(e);
  }
  const others = all.slice(1, 1 + (trial % 5)),
    source = new Set(nodes.filter((_, i) => (i + trial) % 3 === 0)),
    target = new Set(nodes.filter((_, i) => (i + trial) % 4 === 0)),
    guard = new RouteSearchWorkGuard(Background, 'Default', 1000n);
  const allowed = edgeCanOverlapEdgesGuarded(
      all[0]!,
      others,
      source,
      target,
      guard,
    ),
    overlap = overlappingEdgesGuarded(
      new Point(10, 0),
      new Point(10, 30),
      others,
      guard,
    ).map((e) => all.indexOf(e)),
    cross = routeIntersectsNodeGuarded(nodes, all[0]!, guard);
  expect({ allowed, overlap, cross, work: Number(guard.Used()) }).toEqual({
    allowed: f.allowed,
    overlap: f.overlap,
    cross: f.cross,
    work: f.work,
  });
});
