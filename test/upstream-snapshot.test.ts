import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/upstream-snapshot.json';
import { build } from './helpers/upstream-graph.js';
import {
  NewGraphStateSnapshot,
  RollbackGraphState,
} from '../src/upstream/layoutgraph/graph-state.js';
import { collectRuntimeObjectsContext } from '../src/upstream/layoutgraph/runtime-objects.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  captureExactSlice,
  captureExactSliceMap,
} from '../src/upstream/layoutgraph/transaction-snapshot.js';
import {
  setSliceCapacity,
  sliceCapacity,
} from '../src/upstream/layoutgraph/topology-preflight.js';
describe('upstream transaction snapshot and rollback', () => {
  it.each(fixtures)(
    'matches Go geometry, ownership, identity and work for trial $trial',
    (f) => {
      const g = build(f.trial),
        topology = f.trial % 2 === 0,
        guard = new WorkGuard(
          Background,
          'snapshot fixture',
          MaxEngineWorkUnits,
        );
      const state = NewGraphStateSnapshot({
        CaptureTopology: topology,
        CaptureEdgeRoutes: f.trial % 3 !== 0,
      });
      state.UpdateWithWorkGuard(g, guard);
      const work = String(guard.Used()),
        objects = collectRuntimeObjectsContext(g, guard, 'fixture'),
        runtimeWork = String(guard.Used());
      const originalNodes = g.Nodes,
        originalEdges = g.Edges,
        originalContainers = g.Containers;
      const pointRefs = new Map([...objects.nodes].map((n) => [n, n.TopLeft])),
        labelRefs = new Map([...objects.nodes].map((n) => [n, n.Label]));
      for (const n of objects.nodes) {
        if (n.TopLeft) {
          n.TopLeft.X += 17;
          n.TopLeft.Y -= 9;
        }
        n.TopLeft = new Point(999, 888);
        n.Width += 51;
        n.Height += 31;
        if (n.Label) {
          n.Label.Text = 'mutated';
          n.Label.Width += 10;
        }
        n.Label = Object.assign(new Label(), { Text: 'replacement' });
        n.Edges = [];
        n.Nears = new Set();
        n.LoopOffsets = new Map([[Orientation.Bottom, 99]]);
      }
      const routeRefs = new Map([...objects.edges].map((e) => [e, e.Points])),
        pointCopies = new Map(
          [...objects.edges].map((e) => [e, e.Points.slice()]),
        );
      for (const e of objects.edges) {
        for (const p of e.Points) p.X += 55;
        e.Points = [new Point(101, 202)];
        e.MinWidth += 3;
        if (e.Label) e.Label.Text = 'changed edge';
      }
      const cluster = [...g.Clusters.values()][0]!,
        tree = [...g.Trees.values()][0]![0]!;
      cluster.Arrangement = 'Column';
      cluster.DesiredArrangement = 'Row';
      cluster.Padding = 88;
      tree.Orientation = Orientation.Top;
      g.Nodes = [new Node(9999n, 1, 1)];
      if (topology) {
        g.Edges = [];
        g.Containers = new Map();
        g.Clusters = new Map();
        g.Sequences = new Map();
        g.Trees = new Map();
      }
      RollbackGraphState(g, state);
      const nodes: Record<string, unknown> = {},
        edges: Record<string, unknown> = {};
      for (const n of objects.nodes)
        nodes[String(n.ID)] = {
          position: n.TopLeft,
          width: n.Width,
          height: n.Height,
          label: n.Label
            ? [n.Label.Text, n.Label.Width, n.Label.PositionFixed()]
            : null,
          samePoint: n.TopLeft === pointRefs.get(n),
          sameLabel: n.Label === labelRefs.get(n),
          incidence: n.Edges.length,
          nears: n.Nears.size,
          loops: Object.fromEntries(n.LoopOffsets),
        };
      for (const e of objects.edges)
        edges[String(e.ID)] = {
          points: e.Points,
          width: e.MinWidth,
          label: e.Label?.Text ?? null,
          sameRoute: e.Points === routeRefs.get(e),
          samePoints:
            e.Points.length === pointCopies.get(e)!.length &&
            e.Points.every((p, i) => p === pointCopies.get(e)![i]),
        };
      const actual = JSON.parse(
        JSON.stringify({
          nodes,
          edges,
          order: g.Nodes.map((n) => Number(n.ID)),
          sameNodes: g.Nodes === originalNodes,
          sameEdges: g.Edges === originalEdges,
          containers: g.Containers.size === originalContainers.size,
          policy: [
            cluster.Arrangement,
            cluster.DesiredArrangement,
            cluster.Padding,
          ],
          orientation: tree.Orientation,
          work,
          runtimeWork,
        }),
      );
      expect(actual).toEqual(f.expected);
      for (const n of objects.nodes) expect(n.Shape.GetBox()).toBe(n.Box);
    },
  );
  it('restores original arrays and map entries after replacement and in-place edits', () => {
    const items = setSliceCapacity([1, 2, 3], 8),
      map = new Map([['a', items]]),
      snapshot = captureExactSliceMap(map);
    items[0] = 99;
    items.push(4);
    map.clear();
    map.set('b', [7]);
    expect(snapshot.restore()).toBe(map);
    expect(map.get('a')).toBe(items);
    expect(items).toEqual([1, 2, 3]);
    expect(sliceCapacity(items)).toBe(8);
    const second = captureExactSlice(items);
    items.length = 0;
    expect(second.restore()).toBe(items);
    expect(items).toEqual([1, 2, 3]);
  });
});
