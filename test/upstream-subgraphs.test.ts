import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-subgraphs.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Preprocess } from '../src/upstream/trees/preprocess.js';
import { reachableNodesGuarded } from '../src/upstream/layoutgraph/reachability.js';
import { SplitSubgraphsTracked } from '../src/upstream/layoutgraph/subgraphs.js';
function build(f: (typeof fixtures)[number]) {
  const g = new Graph(),
    all: Node[] = [];
  g.CellSize = 123.25;
  g.IsRootHierarchy = f.trial % 2 === 0;
  for (const r of f.nodes) {
    const n = g.AddNode(new Node(BigInt(r.id), 60, 40));
    all.push(n);
    g.AddNodeToContainer(r.parent ? all[r.parent - 1]! : null, n);
    if (r.fixed) n.FixedTopLeft = new Point(0, 0);
  }
  for (const [a, b] of f.edges) {
    const e = g.Connect(all[a! - 1]!, all[b! - 1]!);
    e.ID = BigInt(g.Edges.length);
    e.TargetArrowhead = 'triangle';
  }
  for (const [a, b] of f.nears) all[a! - 1]!.AddNear(all[b! - 1]!);
  let external: Node | null = null;
  if (f.trial % 7 === 0) {
    external = new Node(999n, 30, 20);
    external.Graph = g;
    all[0]!.AddNear(external);
  }
  if (f.trial % 3 === 0) Preprocess(Background, g);
  return { g, all, external };
}
it.each(fixtures)(
  'matches Go reachability and tracked subgraph split $trial',
  (f) => {
    const { g, all, external } = build(f),
      options = {
        IncludeContainers: (f.trial & 1) !== 0,
        IncludeNears: (f.trial & 2) !== 0,
        TraverseTrees: (f.trial & 4) !== 0,
      },
      guard = new WorkGuard(Background, 'split fixture', MaxEngineWorkUnits),
      ids = (ns: Node[]) => ns.map((n) => Number(n.ID)),
      reachable = ids(
        reachableNodesGuarded(
          g.Nodes[0]!,
          (n) => n.ID % 5n !== 0n,
          options.IncludeContainers,
          options.IncludeNears,
          options.TraverseTrees,
          new Set([all.at(-1)!]),
          guard,
        ),
      ),
      reachWork = String(guard.Used());
    const [graphs, journal] = SplitSubgraphsTracked(
        Background,
        g,
        options,
        guard,
      ),
      owners: Record<string, number> = {};
    const subs = graphs.map((sub, i) => {
      for (const n of sub.Nodes) {
        owners[String(n.ID)] = i + 1;
        expect(journal.OriginalGraph(n)).toEqual([g, true]);
      }
      for (const key of [
        'Containers',
        'Clusters',
        'Trees',
        'NodeToTree',
        'Sequences',
        'Hubs',
        'Directions',
        'CommonUncleSiblings',
      ] as const)
        expect(sub[key]).toBe(g[key]);
      return {
        nodes: ids(sub.Nodes),
        edges: sub.Edges.map((e) => Number(e.ID)),
        cell: sub.CellSize,
        root: sub.IsRootHierarchy,
      };
    });
    journal.Restore();
    for (const n of all) expect(n.Graph).toBe(g);
    if (external) expect(external.Graph).toBe(g);
    expect({
      reachable,
      reachWork,
      graphs: subs,
      owners,
      work: String(guard.Used()),
    }).toEqual(f.expected);
  },
);
it('restores near-only ownership when cancellation occurs after a split writes graph references', () => {
  const { g, all, external } = build(fixtures[14]!),
    error = new Error('cancel split publication');
  let cancelled = false;
  const ctx = {
    Done: () => ({
      get closed() {
        return (cancelled =
          all.some((n) => n.Graph !== g) ||
          (external !== null && external.Graph !== g));
      },
    }),
    Err: () => (cancelled ? error : null),
  };
  expect(() =>
    SplitSubgraphsTracked(
      ctx,
      g,
      { IncludeContainers: true, IncludeNears: true, TraverseTrees: true },
      null,
    ),
  ).toThrow('cancel split publication');
  for (const n of all) expect(n.Graph).toBe(g);
  expect(external!.Graph).toBe(g);
});
