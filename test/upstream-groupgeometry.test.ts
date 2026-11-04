import { it } from 'vitest';
import fixtures from './fixtures/upstream-groupgeometry.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster, Sequence } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
import {
  clusterSyncGeometryWithWork,
  sequenceSyncGeometryWithWork,
  sequencePlaceVessel,
} from '../src/upstream/layoutgraph/group-geometry.js';
import {
  allDescendantNodesGuarded,
  moveNodeWithChildren,
} from '../src/upstream/layoutgraph/containment.js';
import { positionContainerChildren } from '../src/upstream/layoutgraph/node-geometry.js';
const box = (n: Node) => ({
  TopLeft: n.TopLeft?.Copy() ?? null,
  Width: n.Width,
  Height: n.Height,
});
it.each(fixtures)(
  'matches Go cluster and sequence geometry, traversal and work for trial $trial',
  (f) => {
    const trial = f.trial,
      g = new Graph(),
      v = new Node(1000n, 80, 60);
    v.Graph = g;
    v.isClusterVessel = true;
    if (trial % 7 !== 0) v.TopLeft = new Point(-15.25, 27.75);
    g.Nodes = [v];
    g.Containers.set(null, [v]);
    const c = new Cluster();
    c.Vessel = v;
    c.Graph = g;
    c.Padding = (trial % 17) / 2;
    c.FixedSize = trial % 3 === 0;
    c.Arrangement = trial % 2 === 0 ? 'Column' : 'Row';
    g.Clusters.set(v, c);
    const all = [v];
    for (let j = 0; j < 1 + (trial % 18); j++) {
      const n = new Node(
        BigInt(j + 1),
        (5 + ((trial + j * 11) % 140)) / 2,
        (5 + ((trial + j * 17) % 100)) / 2,
      );
      n.Graph = g;
      n.Cluster = c;
      if ((trial + j) % 3 !== 0) n.TopLeft = new Point(j * 31, j * 47);
      c.Nodes.push(n);
      all.push(n);
      if (j % 3 === 0) {
        n.isContainer = true;
        const child = new Node(BigInt(2000 + j), 7, 5);
        child.TopLeft = new Point(j + 1, j + 2);
        child.Graph = g;
        child.Container = n;
        g.Containers.set(n, [child]);
        all.push(child);
      }
    }
    const guard = new WorkGuard(
        Background,
        'group fixture',
        MaxEngineWorkUnits,
      ),
      work = {
        Step: () => guard.Step(),
        Finish: () => guard.Finish(),
        MoveNodeWithChildren: moveNodeWithChildren,
        PositionContainerChildren: (n: Node) =>
          positionContainerChildren(n, false),
      };
    clusterSyncGeometryWithWork(c, work);
    const boxes = () =>
        Object.fromEntries(all.map((n) => [String(n.ID), box(n)])),
      first = boxes();
    clusterSyncGeometryWithWork(c, work);
    const second = boxes();
    const descendants = [false, true].map((include) =>
      allDescendantNodesGuarded(g, v, include, guard).map((n) => Number(n.ID)),
    );
    const sv = new Node(3000n, 50, 50);
    sv.Graph = g;
    if (trial % 7 !== 0) sv.TopLeft = new Point(4.5, -2.5);
    const seq = new Sequence();
    seq.Vessel = sv;
    seq.Graph = g;
    for (let j = 0; j < 1 + (trial % 18); j++) {
      const n = new Node(
        BigInt(4000 + j),
        (((trial + j * 13) % 100) - 10) / 2,
        (((trial + j * 19) % 60) - 10) / 2,
      );
      n.Graph = g;
      seq.Nodes.push(n);
    }
    sequenceSyncGeometryWithWork(seq, guard);
    const sequence = [box(sv), ...seq.Nodes.map(box)];
    sequencePlaceVessel(seq);
    compare(
      JSON.parse(
        JSON.stringify({
          first,
          second,
          descendants,
          sequence,
          placed: sv.TopLeft,
          work: String(guard.Used()),
        }),
      ),
      f.expected,
    );
  },
);
