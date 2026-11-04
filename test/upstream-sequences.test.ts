import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-sequences.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  AddSequences,
  SequenceDefiningEdges,
} from '../src/upstream/grouping/sequences.js';
import { Cleanup, ResetClusters } from '../src/upstream/grouping/lifecycle.js';
import { GoRandom } from '../src/random.js';
function build(f: (typeof fixtures)[number]) {
  const g = new Graph(),
    all: Node[] = [];
  for (const r of f.nodes) {
    const n = g.AddNode(new Node(BigInt(r.id), r.width, r.height));
    all.push(n);
    g.AddNodeToContainer(r.parent ? all[r.parent - 1]! : null, n);
    n.SetShape(r.shape);
    if (r.point) n.TopLeft = new Point(r.point.x, r.point.y);
    if (r.fixed) n.FixedTopLeft = new Point(r.fixed.x, r.fixed.y);
  }
  for (const r of f.edges) {
    const e = g.Connect(all[r.from - 1]!, all[r.to - 1]!);
    e.ID = BigInt(r.id);
    e.TargetArrowhead = 'triangle';
  }
  return { g, all };
}
function capture(g: Graph, all: Node[]) {
  const id = (n: Node | null) => String(n?.ID ?? 0n),
    ids = (ns: Node[]) => ns.map(id);
  return {
    nodes: ids(g.Nodes),
    containers: Object.fromEntries(
      [...g.Containers].map(([n, ns]) => [id(n), ids(ns)]),
    ),
    geometry: Object.fromEntries(
      [...all, ...g.Nodes].map((n) => [
        id(n),
        {
          point: n.TopLeft ? { x: n.TopLeft.X, y: n.TopLeft.Y } : null,
          width: n.Width,
          height: n.Height,
          container: id(n.Container),
          edges: n.Edges.map((e) => String(e.ID)),
        },
      ]),
    ),
    edges: g.Edges.map((e) => [String(e.ID), id(e.From), id(e.To)]),
    sequences: g.SequenceOrder().map((v) => {
      const s = g.Sequences.get(v)!;
      return {
        id: id(v),
        nodes: ids(s.Nodes),
        container: id(s.Container),
        active: s.Vessel!.Graph !== null,
        abductions: s.EdgeAbductions.map((a) => [
          String(a.Edge.ID),
          id(a.OriginallyFrom),
          id(a.OriginallyTo),
          id(a.CurrentFrom),
          id(a.CurrentTo),
        ]),
      };
    }),
  };
}
it.each(fixtures)(
  'matches Go sequence discovery, cleanup and repeated layout $trial',
  (f) => {
    const { g, all } = build(f),
      defined = [...SequenceDefiningEdges(Background, g)]
        .map(Number)
        .sort((a, b) => a - b),
      random = new GoRandom(BigInt(f.seed));
    AddSequences(Background, g, random);
    const active = capture(g, all);
    g.Nodes.forEach((n, j) => {
      if (n.TopLeft === null)
        n.TopLeft = new Point(j * 200 + 50, (j % 3) * 200 + 50);
    });
    Cleanup(g);
    const clean = capture(g, all);
    ResetClusters(g);
    AddSequences(Background, g, new GoRandom(BigInt(f.seed)));
    const repeated = capture(g, all);
    expect({
      defined,
      active,
      clean,
      repeated,
      random: String(random.int63()),
    }).toEqual(f.expected);
  },
);
it('restores consumed edges and member widths after cancellation during sequence installation', () => {
  const f = fixtures[7]!,
    { g, all } = build(f),
    nodes = g.Nodes,
    edges = g.Edges,
    containers = g.Containers,
    sequences = g.Sequences,
    before = capture(g, all),
    points = all.map((n) => n.TopLeft),
    incidence = all.map((n) => n.Edges),
    error = new Error('cancel sequence installation');
  let cancelled = false;
  const ctx = {
    Done: () => ({
      get closed() {
        return (cancelled = g.Nodes !== nodes);
      },
    }),
    Err: () => (cancelled ? error : null),
  };
  expect(() => AddSequences(ctx, g, new GoRandom(BigInt(f.seed)))).toThrow(
    'cancel sequence installation',
  );
  expect(g.Nodes).toBe(nodes);
  expect(g.Edges).toBe(edges);
  expect(g.Containers).toBe(containers);
  expect(g.Sequences).toBe(sequences);
  expect(capture(g, all)).toEqual(before);
  all.forEach((n, j) => {
    expect(n.TopLeft).toBe(points[j]);
    expect(n.Edges).toBe(incidence[j]);
    expect(n.Sequence).toBeNull();
  });
});
