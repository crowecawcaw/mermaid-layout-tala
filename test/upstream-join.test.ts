import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-join.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  WorkGuard,
  MaxTransactionWorkUnits,
} from '../src/upstream/limits/work.js';
import { contextWithTransactionWorkGuard } from '../src/upstream/layoutgraph/transaction.js';
import { distanceClustersWithWorkGuard } from '../src/upstream/layoutgraph/distance-clusters.js';
import {
  JoinDistancedClusters,
  JoinPositionJournal,
} from '../src/upstream/grouping/join.js';
function build(f: (typeof fixtures)[number]) {
  const g = new Graph();
  g.CellSize = f.cell;
  for (const r of f.nodes) {
    const n = g.AddNode(new Node(BigInt(r.id), r.width, r.height));
    g.AddNodeToContainer(null, n);
    n.TopLeft = new Point(r.point.x, r.point.y);
    if (r.fixed) n.FixedTopLeft = new Point(r.fixed.x, r.fixed.y);
  }
  for (let j = 1; j < g.Nodes.length; j++) {
    if (f.trial % 6 < 4) {
      const e = g.Connect(g.Nodes[j - 1]!, g.Nodes[j]!);
      e.ID = BigInt(j);
      e.TargetArrowhead = 'triangle';
    } else if (f.trial % 6 === 4) g.Nodes[j - 1]!.AddNear(g.Nodes[j]!);
  }
  return g;
}
it.each(fixtures)(
  'matches Go disconnected-island discovery and joining $trial',
  (f) => {
    const g = build(f),
      guard = new WorkGuard(
        Background,
        'join fixture',
        MaxTransactionWorkUnits,
      ),
      clusters = (
        distanceClustersWithWorkGuard(g.Nodes, 3 * g.CellSize, guard) ?? []
      ).map((c) => c.map((n) => Number(n.ID))),
      clusterWork = String(guard.Used());
    JoinDistancedClusters(
      contextWithTransactionWorkGuard(Background, guard),
      g,
    );
    expect({
      clusters,
      clusterWork,
      positions: g.Nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
      work: String(guard.Used()),
    }).toEqual(f.expected);
  },
);
it('restores shared point identity in reverse journal order', () => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 20, 20)),
    b = g.AddNode(new Node(2n, 20, 20)),
    p = new Point(10, 20);
  a.TopLeft = p;
  b.TopLeft = p;
  const journal = new JoinPositionJournal(),
    guard = new WorkGuard(Background, 'journal', 1000n);
  journal.moveWithChildren(a, 5, 7, guard);
  journal.moveWithChildren(b, 3, 11, guard);
  journal.restore();
  expect(a.TopLeft).toBe(p);
  expect(b.TopLeft).toBe(p);
  expect(p).toEqual(new Point(10, 20));
});
it('rolls back all island movement when cancelled after translation', () => {
  const error = new Error('cancel island movement');
  const moving = build(fixtures[10]!); // Near-only graphs also use the guarded join path.
  const p = moving.Nodes.map((n) => n.TopLeft!),
    v = p.map((x) => x.Copy());
  let stopped = false;
  const c = {
    Done: () => ({
      get closed() {
        return (stopped = moving.Nodes.some(
          (n, j) => n.TopLeft!.X !== v[j]!.X || n.TopLeft!.Y !== v[j]!.Y,
        ));
      },
    }),
    Err: () => (stopped ? error : null),
  };
  expect(() => JoinDistancedClusters(c, moving)).toThrow(
    'cancel island movement',
  );
  moving.Nodes.forEach((n, j) => {
    expect(n.TopLeft).toBe(p[j]);
    expect(n.TopLeft).toEqual(v[j]);
  });
});
