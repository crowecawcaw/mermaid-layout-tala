import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-enginecompound.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { TriangleArrowhead } from '../src/upstream/layoutgraph/records.js';
import {
  CompoundCandidate,
  compoundCrossAxisDetours,
} from '../src/upstream/engine/compound-candidate.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go compound candidate $trial', (f) => {
  const g = new Graph(),
    roots: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = new Node(BigInt(i + 1), 100, 80);
    n.TopLeft = new Point(i * 400, 0);
    g.AddNewNodeToContainer(null, n);
    roots.push(n);
  }
  const container = roots[1]!;
  container.Width = 300;
  container.Height = 200;
  const first = new Node(5n, 60, 40),
    second = new Node(6n, 60, 40);
  first.TopLeft = new Point(460, 60);
  second.TopLeft = new Point(580, 100);
  g.AddNewNodeToContainer(container, first);
  g.AddNewNodeToContainer(container, second);
  g.Directions.set(container, O.Right);
  for (const [a, b] of [
    [roots[0]!, first],
    [first, second],
    [second, roots[2]!],
    [roots[0]!, roots[3]!],
    [roots[3]!, roots[2]!],
  ] as [Node, Node][]) {
    const e = g.Connect(a, b);
    e.TargetArrowhead = TriangleArrowhead;
    e.Points = [e.From.Center(), e.To.Center()];
  }
  g.Directions.set(null, [O.Top, O.Right, O.Bottom, O.Left][f.trial % 4]!);
  if (f.trial % 5 === 0) first.FixedTopLeft = first.TopLeft!.Copy();
  const detours = compoundCrossAxisDetours(g);
  let error = '',
    candidate = g;
  try {
    candidate = CompoundCandidate(Background, g);
  } catch (e) {
    error = (e as Error).message;
  }
  expect({ error, changed: candidate !== g, detours }).toEqual({
    error: f.error,
    changed: f.changed,
    detours: f.detours,
  });
  compare(
    candidate.Nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y, n.Width, n.Height]),
    f.nodes,
  );
  compare(
    candidate.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))),
    f.routes,
  );
});
