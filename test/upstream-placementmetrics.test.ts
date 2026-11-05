import {
  visibilityEdges,
  orderedAlongAxis,
  candidateMoves,
} from '../src/upstream/placement/compaction-geometry.js';
import { rotateAround } from '../src/upstream/placement/rotation.js';
import { SizedSetup } from '../src/upstream/placement/sized-setup.js';
import { GoRandom } from '../src/random.js';
import { iterPlacementsAroundPoint } from '../src/upstream/placement/sized-kernels.js';
import { moveNodeToBestGuarded } from '../src/upstream/placement/sizeless-moves.js';
import { nodeCandidatePositions } from '../src/upstream/placement/initialize-candidates.js';
import { SizelessCandidates } from '../src/upstream/placement/sizeless-candidates.js';
import { moveNodeToBest } from '../src/upstream/placement/moves.js';
import {
  optimizerMedian,
  optimizerCanMove,
  chargeOptimizerScoring,
} from '../src/upstream/placement/optimizer-metrics.js';
import { optimizerAdjacents } from '../src/upstream/placement/optimizer-adjacents.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../src/upstream/limits/optimization.js';
import { direct } from '../src/upstream/placement/direct.js';
import { mirrorAxes } from '../src/upstream/placement/mirror.js';
import { Background } from '../src/upstream/limits/context.js';
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
  for (let j = 1; j <= 1 + (f.trial % 5); j++) {
    const edge = g.Connect(nodes[0]!, nodes[j]!);
    if (j % 2 === 0) edge.SourceArrowhead = 'triangle';
    else edge.TargetArrowhead = 'triangle';
  }
  const placements: number[][] = [];
  iterPlacementsAroundPoint(nodes[0]!, 1, 2, f.trial % 2 === 0, (x, y) => {
    placements.push([x, y]);
    return false;
  });
  compare(placements, f.placements);
  const guard = new OptimizationWorkGuard(
    Background,
    'test',
    MaxOptimizationWorkUnits,
  );
  const guarded = optimizerAdjacents(nodes[0]!, null, guard);
  compare(
    { ids: guarded.map((n) => Number(n.ID)), work: String(guard.Used()) },
    { ids: f.guardedIDs, work: f.guardedWork },
  );
  const guardedMedian = optimizerMedian(guarded, true, guard);
  const guardedMove = optimizerCanMove(
    nodes[0]!,
    new Point(f.trial % 100, (f.trial * 3) % 100),
    true,
    guard,
  );
  chargeOptimizerScoring(nodes[0]!, null, true, guard);
  compare(
    { median: guardedMedian, move: guardedMove, work: String(guard.Used()) },
    { median: f.guardedMedian, move: f.guardedMove, work: f.metricWork },
  );
  const sizedRandom = new GoRandom(BigInt(f.trial + 1));
  const sized = new SizedSetup(Background, g, null, null, sizedRandom, []);
  const sizedGuard = new OptimizationWorkGuard(
    Background,
    'sized',
    MaxOptimizationWorkUnits,
  );
  const sizedMedian = sized.medianPointGuarded(nodes[0]!, 1.5, [], sizedGuard);
  compare(
    {
      median: [sizedMedian.X, sizedMedian.Y],
      next: String(sizedRandom.int63()),
      work: String(sizedGuard.Used()),
    },
    { median: f.sizedMedian, next: f.sizedNext, work: f.sizedWork },
  );
  const compaction = Array.from({ length: 4 }, (_, mask) => {
    const horizontal = (mask & 1) !== 0,
      include = (mask & 2) !== 0,
      edges = visibilityEdges(Background, g, horizontal, include);
    return {
      edges: edges.map((e) => [Number(e.From.ID), Number(e.To.ID)]),
      order: orderedAlongAxis(g, horizontal).map((n) => Number(n.ID)),
      points: candidateMoves(
        Background,
        g,
        nodes[0]!,
        2,
        horizontal,
        include,
        0,
        edges,
      ).map((p) => [p.X, p.Y]),
    };
  });
  compare(compaction, f.compaction);
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
  mirrorAxes(Background, g, f.trial % 2 === 0, f.trial % 3 === 0);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.mirrored,
  );
  direct(Background, g, nodes, null, { checkEdgeLength: f.trial % 2 === 0 });
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.directed,
  );
  const moveGuard = new OptimizationWorkGuard(
    Background,
    'move',
    MaxOptimizationWorkUnits,
  );
  const point = nodes[0]!.TopLeft!.Copy();
  const moved = moveNodeToBest(
    Background,
    g,
    nodes[0]!,
    [
      point,
      new Point(point.X + 100, point.Y),
      new Point(point.X, point.Y + 100),
    ],
    null,
    f.trial % 2 === 0,
    moveGuard,
  );
  compare(
    {
      position: [nodes[0]!.TopLeft!.X, nodes[0]!.TopLeft!.Y],
      moved,
      work: String(moveGuard.Used()),
    },
    { position: f.movePosition, moved: f.moved, work: f.moveWork },
  );
  const optim = new SizelessCandidates(Background, g, null);
  const candidateGuard = new OptimizationWorkGuard(
    Background,
    'candidate',
    MaxOptimizationWorkUnits,
  );
  const center = new Point(f.trial % 100, (f.trial * 3) % 100);
  const distance = optim.findClosestUnoccupiedDistanceGuarded(
    nodes[0]!,
    center,
    candidateGuard,
  );
  const candidates = optim.placementPointsGuarded(
    nodes[0]!,
    center,
    distance,
    candidateGuard,
  );
  compare(
    {
      distance,
      points: candidates.map((p) => [p.X, p.Y]),
      work: String(candidateGuard.Used()),
    },
    {
      distance: f.candidateDistance,
      points: f.candidates,
      work: f.candidateWork,
    },
  );
  compare(
    nodeCandidatePositions(Background, nodes[0]!, g, optim).map((p) => [
      p.X,
      p.Y,
    ]),
    f.initialPoints,
  );
  const sizeGuard = new OptimizationWorkGuard(
    Background,
    'sizeless',
    MaxOptimizationWorkUnits,
  );
  const sizeMoved = moveNodeToBestGuarded(
    Background,
    nodes[0]!,
    candidates,
    sizeGuard,
  );
  compare(
    {
      moved: sizeMoved,
      position: [nodes[0]!.TopLeft!.X, nodes[0]!.TopLeft!.Y],
      work: String(sizeGuard.Used()),
    },
    { moved: f.sizeMoved, position: f.sizePosition, work: f.sizeWork },
  );
  rotateAround(nodes[0]!, g, nodes[1]!, 1 + (f.trial % 3), f.trial % 2 === 0);
  compare([nodes[0]!.TopLeft!.X, nodes[0]!.TopLeft!.Y], f.rotation);
});
