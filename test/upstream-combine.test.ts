import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packing.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { CombineSubgraphs } from '../src/upstream/packing/combine.js';
it.each(fixtures)('matches Go direct graph combination $name', (f) => {
  const master = new Graph(),
    graphs = f.components.map((c) => {
      const g = new Graph();
      for (const r of c.nodes) {
        const n = g.AddNode(new Node(BigInt(r.id), r.width, r.height));
        n.TopLeft = new Point(r.x - r.width / 2, r.y - r.height / 2);
      }
      return g;
    });
  const result = CombineSubgraphs(Background, master, graphs, []);
  expect(
    Object.fromEntries(
      result.Nodes.map((n) => [
        String(n.ID),
        { x: n.Center().X, y: n.Center().Y },
      ]),
    ),
  ).toEqual(f.expected);
});

import richFixtures from './fixtures/upstream-combine.json';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Box } from '../src/upstream/geo/box.js';
import { CopyEntitiesFrom } from '../src/upstream/layoutgraph/subgraphs.js';
function buildRich(f: (typeof richFixtures)[number]) {
  const master = new Graph(),
    graphs: Graph[] = [],
    all = new Map<number, Node>();
  for (const r of f.nodes) {
    let g = graphs[r.group];
    if (!g) {
      g = new Graph();
      CopyEntitiesFrom(g, master);
      graphs[r.group] = g;
    }
    const n = new Node(BigInt(r.id), r.width, r.height);
    master.AddNodeUnchecked(n);
    if (r.parent) n.Graph = g;
    else g.AddNodeUnchecked(n);
    g.AddNodeToContainer(r.parent ? all.get(r.parent)! : null, n);
    all.set(r.id, n);
    n.TopLeft = new Point(r.point.x, r.point.y);
    if (r.fixed) n.FixedTopLeft = new Point(r.fixed.x, r.fixed.y);
    if (r.label) n.Label = Object.assign(new Label(), r.label);
  }
  for (const r of f.edges) {
    const g = graphs[r.group]!,
      e = g.Connect(all.get(r.from)!, all.get(r.to)!);
    e.ID = BigInt(r.id);
    master.AddEdge(e);
    e.Points = r.points.map((p) => new Point(p.x, p.y));
    e.TargetArrowhead = 'triangle';
    if (r.label) e.Label = Object.assign(new Label(), r.label);
  }
  return {
    master,
    graphs,
    all,
    obstacles: f.obstacles.map(
      (o) => new Box(new Point(o.TopLeft.x, o.TopLeft.y), o.Width, o.Height),
    ),
  };
}
it.each(richFixtures)(
  'matches Go routed compound graph combination $trial',
  (f) => {
    const { master, graphs, obstacles } = buildRich(f),
      combined = CombineSubgraphs(Background, master, graphs, obstacles);
    expect({
      nodes: combined.Nodes.map((n) => ({
        id: Number(n.ID),
        point: { x: n.TopLeft!.X, y: n.TopLeft!.Y },
        owner: n.Graph === combined,
      })),
      edges: combined.Edges.map((e) => ({
        id: Number(e.ID),
        points: e.Points.map((p) => ({ x: p.X, y: p.Y })),
      })),
    }).toEqual(f.expected);
  },
);
it('restores node ownership, positions and route identities after cancellation during combination', () => {
  const { master, graphs, all, obstacles } = buildRich(richFixtures[6]!),
    original = [...all.values()].map((n) => ({
      n,
      graph: n.Graph,
      point: n.TopLeft!,
      value: n.TopLeft!.Copy(),
    })),
    routes = master.Edges.map((e) => ({
      e,
      points: e.Points,
      values: e.Points.map((p) => ({ p, value: p.Copy() })),
    })),
    error = new Error('cancel combine');
  let cancelled = false;
  const ctx = {
    Done: () => ({
      get closed() {
        return (cancelled = original.some(
          (r) =>
            r.n.Graph !== r.graph ||
            r.point.X !== r.value.X ||
            r.point.Y !== r.value.Y,
        ));
      },
    }),
    Err: () => (cancelled ? error : null),
  };
  expect(() => CombineSubgraphs(ctx, master, graphs, obstacles)).toThrow(
    'cancel combine',
  );
  for (const r of original) {
    expect(r.n.Graph).toBe(r.graph);
    expect(r.n.TopLeft).toBe(r.point);
    expect(r.point).toEqual(r.value);
  }
  for (const r of routes) {
    expect(r.e.Points).toBe(r.points);
    r.values.forEach((v, i) => {
      expect(r.e.Points[i]).toBe(v.p);
      expect(v.p).toEqual(v.value);
    });
  }
});
