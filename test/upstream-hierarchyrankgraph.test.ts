import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchyrankgraph.json';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  TriangleArrowhead,
  NoArrowhead,
} from '../src/upstream/layoutgraph/records.js';
import { newRankProblem } from '../src/upstream/hierarchy/rank-graph.js';
it.each(fixtures)('matches Go rank graph preparation $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  for (let i = 0; i < 5; i++) {
    const e = g.Connect(nodes[i]!, nodes[i + 1]!);
    e.TargetArrowhead = TriangleArrowhead;
    if ((f.trial + i) % 4 === 0) {
      e.hierarchyRankWeight = 2 + i;
      e.hierarchyRankWeightSet = true;
    }
  }
  if (f.trial % 3 === 0) {
    const e = g.Connect(nodes[0]!, nodes[4]!);
    e.TargetArrowhead = TriangleArrowhead;
  }
  if (f.trial % 7 === 0) g.Edges[0]!.TargetArrowhead = NoArrowhead;
  if (f.trial % 11 === 0) {
    const e = g.Connect(nodes[5]!, nodes[0]!);
    e.TargetArrowhead = TriangleArrowhead;
  }
  g.Edges.forEach((e, i) => {
    e.ID = BigInt(i + 1);
  });
  const guard = new OptimizationWorkGuard(Background, 'RankDAG', 10000000n);
  let error = '',
    levels: number[] | null = [],
    pivot: number[] = [],
    starts: number[] = [],
    edges: number[][] = [];
  try {
    const problem = newRankProblem(g, guard);
    try {
      levels = problem.longestPathLevels(guard).map(Number);
    } catch (e) {
      levels = null;
      throw e;
    }
    pivot = problem.pivotOrder;
    starts = problem.outgoingStart;
    edges = problem.edges.map((e) => [
      e.from,
      e.to,
      Number(e.weight),
      Number(e.id),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }
  expect({
    error,
    levels,
    pivot,
    starts,
    edges,
    work: Number(guard.Used()),
  }).toEqual({
    error: f.error,
    levels: f.levels,
    pivot: f.pivot,
    starts: f.starts,
    edges: f.edges,
    work: f.work,
  });
});
