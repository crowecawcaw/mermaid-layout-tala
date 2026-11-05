import { transformsTo } from '../src/upstream/placement/direction.js';
import { it } from 'vitest';
import fixtures from './fixtures/upstream-placementmetrics.json';
import { compare } from './helpers/compare.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  adjacents,
  median,
  intersectsOtherNode,
  withinMaxSize,
} from '../src/upstream/placement/metrics.js';

it.each(fixtures)('matches Go placement metrics $trial', (f) => {
  const g = new Graph();
  g.CellSize = f.cell;
  const nodes = f.nodes.map((r, i) => {
    const n = new Node(BigInt(i + 1), r.w, r.h);
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(r.x, r.y);
    return n;
  });
  for (let j = 1; j <= 1 + (f.trial % 5); j++) g.Connect(nodes[0]!, nodes[j]!);
  const neighbors = adjacents(nodes[0]!, null);
  const counts = {
    left: f.trial % 5,
    right: Math.floor(f.trial / 5) % 5,
    top: Math.floor(f.trial / 25) % 5,
    bottom: Math.floor(f.trial / 125) % 5,
  };
  compare(
    Array.from({ length: 9 }, (_, d) => {
      const r = transformsTo(counts, d);
      return [r.mirrorX, r.mirrorY];
    }),
    f.transforms,
  );
  compare(
    {
      neighbors: neighbors.map((n) => Number(n.ID)),
      median: [...median(neighbors, false), ...median(neighbors, true)],
      intersection: intersectsOtherNode(g, nodes[0]!, nodes[1]!),
      fits: withinMaxSize(g),
    },
    {
      neighbors: f.neighbors,
      median: f.median,
      intersection: f.intersection,
      fits: f.fits,
    },
  );
});
