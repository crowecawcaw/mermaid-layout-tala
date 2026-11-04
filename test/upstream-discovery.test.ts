import { Preprocess } from '../src/upstream/trees/preprocess.js';
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-discovery.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Tree } from '../src/upstream/layoutgraph/records.js';
import { Kind } from '../src/upstream/nodeshape/kind.js';
import { Point } from '../src/upstream/geo/point.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  extractTrees,
  putBackNonBranchingTrees,
} from '../src/upstream/trees/discovery.js';
import { buildNodeToTreeGuarded } from '../src/upstream/trees/preprocess-helpers.js';
describe('upstream tree discovery and pruning', () => {
  it.each(
    fixtures.flatMap((f) => [
      { ...f, wrapper: false },
      { ...f, wrapper: true },
    ]),
  )(
    'matches exact Go topology and work counts for $name (wrapper=$wrapper)',
    (f) => {
      const g = new Graph(),
        all = new Map<number, Node>();
      for (const record of f.nodes) {
        const n = g.AddNode(new Node(BigInt(record.id), 60, 40));
        all.set(record.id, n);
        g.AddNodeToContainer(record.parent ? all.get(record.parent)! : null, n);
        if (record.fixed) n.FixedTopLeft = new Point(0, 0);
        if (record.near) n.Nears.add(all.get(1)!);
        if (record.table) n.SetShape('Table');
      }
      for (const record of f.edges) {
        const e = g.Connect(all.get(record.from)!, all.get(record.to)!);
        e.ID = BigInt(record.id);
        e.SourceArrowhead = record.source;
        e.TargetArrowhead = record.target;
      }
      const guard = new WorkGuard(
        Background,
        'discovery fixture',
        MaxEngineWorkUnits,
      );
      if (f.wrapper) Preprocess(Background, g);
      else {
        g.Trees = extractTrees(g, guard);
        guard.Step();
        guard.Check();
        putBackNonBranchingTrees(g, guard);
        buildNodeToTreeGuarded(g, guard);
        guard.Finish();
      }
      const encode = (t: Tree): unknown => ({
        node: Number(t.Node.ID),
        parent: Number(t.Parent?.Node.ID ?? 0n),
        edge: Number(t.SentinelEdge?.ID ?? 0n),
        children: t.Children.map(encode),
      });
      const actual = {
        nodes: g.Nodes.map((n) => Number(n.ID)),
        edges: g.Edges.map((e) => Number(e.ID)),
        incidence: Object.fromEntries(
          [...all.values()].map((n) => [
            String(n.ID),
            n.Edges.map((e) => Number(e.ID)),
          ]),
        ),
        containers: Object.fromEntries(
          [...g.Containers].map(([n, children]) => [
            String(n?.ID ?? 0n),
            children.map((c) => Number(c.ID)),
          ]),
        ),
        roots: Object.fromEntries(
          [...g.Trees].map(([n, roots]) => [
            String(n?.ID ?? 0n),
            roots.map(encode),
          ]),
        ),
        members: Object.fromEntries(
          [...g.NodeToTree].map(([n, t]) => [String(n.ID), Number(t.Node.ID)]),
        ),
        work: String(guard.Used()),
      };
      if (f.wrapper) {
        const { work, ...expected } = f.expected;
        const { work: _, ...topology } = actual;
        expect(topology).toEqual(expected);
      } else expect(actual).toEqual(f.expected);
    },
  );
});
