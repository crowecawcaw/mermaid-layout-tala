import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-treeplacement.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Position } from '../src/upstream/label/label.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  WorkGuard,
  MaxPlaceTreesWorkUnits,
} from '../src/upstream/limits/work.js';
import { Preprocess } from '../src/upstream/trees/preprocess.js';
import {
  Place,
  placeTrees,
  placeTreesWithWorkLimit,
} from '../src/upstream/trees/placement.js';
import { compare } from './helpers/compare.js';
function build(f: (typeof fixtures)[number]) {
  const g = new Graph();
  const all = new Map<number, Node>();
  for (const r of f.nodes) {
    const n = g.AddNode(new Node(BigInt(r.id), r.width, r.height));
    g.AddNodeToContainer(null, n);
    all.set(r.id, n);
  }
  for (const r of f.edges) {
    const e = g.Connect(all.get(r.from)!, all.get(r.to)!);
    e.ID = BigInt(r.id);
    e.SourceArrowhead = r.source;
    e.TargetArrowhead = r.target;
    if (r.label) e.Label = Object.assign(new Label(), r.label);
  }
  g.Directions.set(null, f.direction);
  Preprocess(Background, g);
  g.Nodes.forEach(
    (n, j) => (n.TopLeft = new Point(j * 230 + 100, (j % 2) * 260 + 100)),
  );
  return g;
}
it.each(
  fixtures.flatMap((f) => [
    { ...f, wrapper: false },
    { ...f, wrapper: true },
  ]),
)('matches Go complete tree placement $name wrapper=$wrapper', (f) => {
  const g = build(f),
    guard = new WorkGuard(
      Background,
      'placement fixture',
      MaxPlaceTreesWorkUnits,
    );
  if (f.wrapper) Place(Background, g, null);
  else placeTrees(Background, g, null, guard);
  const actual = {
    nodes: g.Nodes.map((n) => ({
      id: Number(n.ID),
      point: { x: n.TopLeft!.X, y: n.TopLeft!.Y },
      width: n.Width,
      height: n.Height,
    })),
    edges: g.Edges.map((e) => ({
      id: Number(e.ID),
      position: e.Label?.Position ?? Position.Unset,
    })),
    parents: Object.fromEntries(
      [...g.NodeToTree].map(([n, t]) => [
        String(n.ID),
        Number(t.Parent?.Node.ID ?? 0n),
      ]),
    ),
    work: String(guard.Used()),
  };
  if (f.wrapper) {
    const { work, ...expected } = f.expected;
    const { work: _, ...result } = actual;
    compare(result, expected);
  } else compare(actual, f.expected);
});

it('rolls back the complete placement after cancellation and work exhaustion', () => {
  for (const limit of [1n, 1000n, 5000n, 15000n]) {
    const g = build(fixtures[24]!);
    const nodes = g.Nodes,
      edges = g.Edges,
      trees = g.Trees;
    const before = nodes.map((n) => ({
      n,
      p: n.TopLeft,
      w: n.Width,
      h: n.Height,
      x: n.TopLeft?.X,
      y: n.TopLeft?.Y,
    }));
    try {
      placeTreesWithWorkLimit(Background, g, null, limit);
    } catch (error) {
      expect(String(error)).toMatch(/work|limit/);
      expect(g.Nodes).toBe(nodes);
      expect(g.Edges).toBe(edges);
      expect(g.Trees).toBe(trees);
      for (const r of before) {
        expect(r.n.TopLeft).toBe(r.p);
        expect(r.n.Width).toBe(r.w);
        expect(r.n.Height).toBe(r.h);
        expect(r.n.TopLeft?.X).toBe(r.x);
        expect(r.n.TopLeft?.Y).toBe(r.y);
      }
    }
  }
  const g = build(fixtures[24]!);
  const nodes = g.Nodes,
    positions = nodes.map((n) => n.TopLeft);
  let checks = 0;
  const error = new Error('placement cancelled');
  const ctx = { Done: () => ({ closed: ++checks > 1000 }), Err: () => error };
  expect(() => Place(ctx, g, null)).toThrow('placement cancelled');
  expect(g.Nodes).toBe(nodes);
  nodes.forEach((n, i) => expect(n.TopLeft).toBe(positions[i]));
});
