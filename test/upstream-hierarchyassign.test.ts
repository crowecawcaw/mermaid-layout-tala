import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchyassign.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { TriangleArrowhead } from '../src/upstream/layoutgraph/records.js';
import { Candidates } from '../src/upstream/hierarchy/eligibility.js';
import { Assign } from '../src/upstream/hierarchy/assign.js';
it.each(fixtures)('matches Go hierarchy assignment $trial', (f) => {
  const g = new Graph();
  g.IsRootHierarchy = f.trial % 2 === 0;
  const nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
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
  pairs.forEach((p, i) => {
    const e = g.Connect(nodes[p[0]!]!, nodes[p[1]!]!);
    if ((f.trial + i) % 4 !== 0) e.TargetArrowhead = TriangleArrowhead;
    if ((f.trial + i) % 9 === 0) e.SourceArrowhead = TriangleArrowhead;
  });
  nodes[0]!.AddNear(nodes[5]!);
  if (f.trial % 7 === 0) nodes[2]!.FixedTopLeft = nodes[2]!.TopLeft!.Copy();
  let error = '';
  try {
    Assign(Background, g, null, Candidates(g));
  } catch (e) {
    error = (e as Error).message;
  }
  expect({
    error,
    levels: nodes.map((n) => (n.Hierarchy ? n.Hierarchy.Levels().get(n)! : -1)),
    counts: nodes.map((n) => n.Hierarchy?.LevelCount ?? 0),
    nears: nodes.map((n) =>
      nodes.filter((other) => n.Nears.has(other)).map((n) => Number(n.ID)),
    ),
  }).toEqual({
    error: f.error,
    levels: f.levels,
    counts: f.counts,
    nears: f.nears,
  });
});
