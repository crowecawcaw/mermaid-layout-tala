import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchysimplex.json';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { TriangleArrowhead } from '../src/upstream/layoutgraph/records.js';
import { newRankProblem } from '../src/upstream/hierarchy/rank-graph.js';
import { solve } from '../src/upstream/hierarchy/rank-simplex.js';
import {
  makeRankResult,
  rankDAGWithLimit,
} from '../src/upstream/hierarchy/rank.js';
it.each(fixtures)('matches Go network simplex $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [],
    count = 4 + (f.trial % 5);
  for (let i = 0; i < count; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  const seen = new Set<string>();
  for (let i = 1; i < count; i++) {
    const parent = f.trial % 3 === 0 ? i - 1 : (i * 7 + f.trial) % i;
    seen.add(`${parent},${i}`);
    const e = g.Connect(nodes[parent]!, nodes[i]!);
    e.TargetArrowhead = TriangleArrowhead;
    e.hierarchyRankWeight = 1 + ((i + f.trial) % 5);
    e.hierarchyRankWeightSet = true;
  }
  for (let i = 0; i < count - 2; i++) {
    const j = i + 2 + ((f.trial + i) % (count - i - 2));
    if (seen.has(`${i},${j}`)) continue;
    const e = g.Connect(nodes[i]!, nodes[j]!);
    e.TargetArrowhead = TriangleArrowhead;
    e.hierarchyRankWeight = 1 + ((f.trial + i * 3) % 5);
    e.hierarchyRankWeightSet = true;
  }
  g.Edges.forEach((e, i) => {
    e.ID = BigInt(i + 1);
  });
  const guard = new OptimizationWorkGuard(Background, 'RankDAG', 10000000n);
  let error = '',
    levels: number[] = [],
    dual = 0n,
    countLevels = 0;
  try {
    const problem = newRankProblem(g, guard),
      initial = problem.longestPathLevels(guard),
      [solved, certificate] = solve(problem, initial, guard),
      [result, primal] = makeRankResult(problem, solved, guard);
    dual = certificate;
    expect(primal).toBe(dual);
    levels = nodes.map((n) => result.nodeToLevel.get(n)!);
    countLevels = result.levelCount;
    const direct = rankDAGWithLimit(Background, g, 10000000n);
    expect(nodes.map((n) => direct.nodeToLevel.get(n))).toEqual(levels);
  } catch (e) {
    error = (e as Error).message;
  }
  expect({
    error,
    levels,
    count: countLevels,
    dual: Number(dual),
    work: Number(guard.Used()),
  }).toEqual({
    error: f.error,
    levels: f.levels,
    count: f.count,
    dual: f.dual,
    work: f.work,
  });
});
