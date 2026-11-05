import { it } from 'vitest';
import fixtures from './fixtures/upstream-optimizerindex.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../src/upstream/limits/optimization.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OptimizerSpatialIndex } from '../src/upstream/placement/optimizer-spatial-index.js';

it.each(fixtures)('matches Go optimizer index $trial', (f) => {
  const g = new Graph();
  g.CellSize = 30;
  for (let i = 0; i < f.count; i++) {
    const n = new Node(BigInt(i + 1), 10 + (i % 12), 12 + (i % 7));
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point((i % 15) * 150, Math.floor(i / 15) * 150);
  }
  const guard = new OptimizationWorkGuard(
      Background,
      'index',
      MaxOptimizationWorkUnits,
    ),
    index = new OptimizerSpatialIndex();
  index.rebuild(g, guard);
  const rebuildWork = String(guard.Used()),
    p = new Point(f.x, f.y);
  const [found, yes] = index.isOccupied(g, p, guard),
    overlap = index.doesOverlap(g.Nodes[0]!, p, [], guard),
    can = index.canMove(g.Nodes[0]!, p, guard);
  compare(
    {
      id: yes ? Number(found!.ID) : 0,
      overlap,
      can,
      rebuildWork,
      work: String(guard.Used()),
    },
    {
      id: f.id,
      overlap: f.overlap,
      can: f.can,
      rebuildWork: f.rebuildWork,
      work: f.work,
    },
  );
});
