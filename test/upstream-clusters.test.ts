import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-clusters.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label, Icon } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  WorkGuard,
  MaxTransactionWorkUnits,
} from '../src/upstream/limits/work.js';
import { contextWithTransactionWorkGuard } from '../src/upstream/layoutgraph/transaction.js';
import { AddClusters } from '../src/upstream/grouping/clusters.js';
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
    if (r.label) n.Label = Object.assign(new Label(), r.label);
    if (r.icon) n.Icon = Object.assign(new Icon(), r.icon);
  }
  for (const r of f.edges) {
    const e = g.Connect(all[r.from - 1]!, all[r.to - 1]!);
    e.ID = BigInt(r.id);
    e.SourceArrowhead = r.source;
    e.TargetArrowhead = r.target;
    e.ToTableColumnIndex = r.column;
  }
  return { g, all };
}
it.each(fixtures)(
  'matches Go complete cluster discovery and installation $trial',
  (f) => {
    const { g, all } = build(f),
      random = new GoRandom(BigInt(f.seed)),
      guard = new WorkGuard(
        Background,
        'cluster fixture',
        MaxTransactionWorkUnits,
      );
    AddClusters(
      contextWithTransactionWorkGuard(Background, guard),
      g,
      BigInt(f.seed),
      random,
    );
    const id = (n: Node | null) => String(n?.ID ?? 0n),
      ids = (ns: Node[]) => ns.map(id),
      point = (p: Point | null) => (p ? { x: p.X, y: p.Y } : null);
    const clusters = g.ClusterOrder().map((v) => {
      const c = g.Clusters.get(v)!;
      return {
        id: id(v),
        members: ids(c.Nodes),
        arrangement: c.Arrangement,
        desired: c.DesiredArrangement,
        padding: c.Padding,
        fixed: c.FixedSize,
        container: id(c.Container),
        point: point(v.TopLeft),
        width: v.Width,
        height: v.Height,
        abductions: c.EdgeAbductions.map((a) => [
          String(a.Edge.ID),
          id(a.OriginallyFrom),
          id(a.OriginallyTo),
          id(a.CurrentFrom),
          id(a.CurrentTo),
        ]),
      };
    });
    const actual = {
      nodes: ids(g.Nodes),
      clusters,
      incidence: Object.fromEntries(
        [...all, ...g.Nodes].map((n) => [
          id(n),
          n.Edges.map((e) => String(e.ID)),
        ]),
      ),
      geometry: all.map((n) => ({
        id: id(n),
        point: point(n.TopLeft),
        width: n.Width,
        height: n.Height,
        container: id(n.Container),
      })),
      containers: Object.fromEntries(
        [...g.Containers].map(([n, ns]) => [id(n), ids(ns)]),
      ),
      edges: g.Edges.map((e) => [String(e.ID), id(e.From), id(e.To)]),
      work: String(guard.Used()),
      random: String(random.int63()),
    };
    expect(actual).toEqual(f.expected);
  },
);
it('restores graph topology and member geometry after cancellation during installation', () => {
  const f = fixtures[7]!,
    { g, all } = build(f),
    nodes = g.Nodes,
    edges = g.Edges,
    containers = g.Containers,
    clusters = g.Clusters,
    original = all.map((n) => ({
      n,
      edges: n.Edges,
      width: n.Width,
      height: n.Height,
      point: n.TopLeft,
      container: n.Container,
    })),
    error = new Error('cancel cluster installation');
  let cancelled = false;
  const ctx = {
    Done: () => ({
      get closed() {
        return (cancelled = g.Nodes !== nodes || g.Clusters.size > 0);
      },
    }),
    Err: () => (cancelled ? error : null),
  };
  expect(() =>
    AddClusters(ctx, g, BigInt(f.seed), new GoRandom(BigInt(f.seed))),
  ).toThrow('cancel cluster installation');
  expect(g.Nodes).toBe(nodes);
  expect(g.Edges).toBe(edges);
  expect(g.Containers).toBe(containers);
  expect(g.Clusters).toBe(clusters);
  expect(clusters.size).toBe(0);
  for (const r of original) {
    expect(r.n.Edges).toBe(r.edges);
    expect(r.n.Width).toBe(r.width);
    expect(r.n.Height).toBe(r.height);
    expect(r.n.TopLeft).toBe(r.point);
    expect(r.n.Container).toBe(r.container);
    expect(r.n.Cluster).toBeNull();
  }
});
