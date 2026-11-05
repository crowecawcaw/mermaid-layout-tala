import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsortedge.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  sortEdges,
  type RouteGenerationFlavor,
} from '../src/upstream/routing/sort-edges.js';
it.each(fixtures)('matches Go route edge ordering $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [],
    clusters = new Set<Node>();
  for (let i = 0; i < 12; i++) {
    const n = g.AddNode(
      new Node(BigInt(i + 1), 20 + (i % 4) * 10, 25 + (i % 3) * 10),
    );
    n.TopLeft = new Point(
      ((trial * 7 + i * 31) % 5) * 40,
      ((trial * 11 + i * 19) % 5) * 40,
    );
    nodes.push(n);
    if ((trial + i) % 7 === 0) clusters.add(n);
  }
  const edges = [];
  for (let i = 0; i < 15 + (trial % 45); i++)
    edges.push(
      g.Connect(
        nodes[(trial + i * 7) % 12]!,
        nodes[(trial * 3 + i * 5 + 1) % 12]!,
      ),
    );
  const ids = new Map(edges.map((e, i) => [e, i]));
  const flavors: RouteGenerationFlavor[] = [
    'Default',
    'ShortestToLongest',
    'LongestToShortest',
    'TopDownLeftRight',
  ];
  expect(
    flavors.map((flavor) => {
      const ordered = [...edges];
      sortEdges(flavor, ordered, clusters);
      return ordered.map((e) => ids.get(e));
    }),
  ).toEqual(f.expected);
});
