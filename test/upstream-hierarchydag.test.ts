import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchydag.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { TriangleArrowhead } from '../src/upstream/layoutgraph/records.js';
import { makeSimpleDAG } from '../src/upstream/hierarchy/dag.js';
import { rankDAG } from '../src/upstream/hierarchy/rank.js';
it.each(fixtures)('matches Go simple hierarchy DAG $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 5; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 3],
  ];
  if (f.trial % 3 === 0) pairs.push([4, 0]);
  if (f.trial % 4 === 0) pairs.push([0, 1]);
  if (f.trial % 5 === 0) pairs.push([2, 2]);
  pairs.forEach((p, i) => {
    const e = g.Connect(nodes[p[0]!]!, nodes[p[1]!]!);
    if ((f.trial + i) % 4 !== 0) e.TargetArrowhead = TriangleArrowhead;
    if ((f.trial + i) % 9 === 0) e.SourceArrowhead = TriangleArrowhead;
  });
  let error = '',
    arcs: number[][] = [],
    levels: number[] = [],
    count = 0;
  try {
    const dag = makeSimpleDAG(Background, g);
    arcs = dag.Edges.map((e) => [
      Number(e.ID),
      Number(e.From.ID),
      Number(e.To.ID),
      e.hierarchyRankWeight,
    ]);
    const result = rankDAG(Background, dag);
    count = result.levelCount;
    levels = dag.Nodes.map((n) => result.nodeToLevel.get(n)!);
  } catch (e) {
    error = (e as Error).message;
  }
  expect({ error, arcs, levels, count }).toEqual({
    error: f.error,
    arcs: f.arcs,
    levels: f.levels,
    count: f.count,
  });
});
