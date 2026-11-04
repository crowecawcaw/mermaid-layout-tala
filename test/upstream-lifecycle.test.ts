import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-lifecycle.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { AddClusters } from '../src/upstream/grouping/clusters.js';
import { Cleanup, ResetClusters } from '../src/upstream/grouping/lifecycle.js';
import { GoRandom } from '../src/random.js';
it.each(fixtures)(
  'matches Go cluster cleanup and repeated metadata retirement $trial',
  (f) => {
    const g = new Graph(),
      all: Node[] = [];
    for (let j = 0; j < 6 + (f.trial % 24); j++) {
      const n = g.AddNode(new Node(BigInt(j + 1), 40 + (j % 3) * 10, 40));
      all.push(n);
      g.AddNodeToContainer(null, n);
      n.TopLeft = new Point(j * 100, (j % 3) * 100);
    }
    for (let j = 2; j < all.length; j++) {
      const e = g.Connect(all[j % 2]!, all[j]!);
      e.ID = BigInt(g.Edges.length);
      e.TargetArrowhead = 'triangle';
    }
    AddClusters(
      Background,
      g,
      BigInt(f.trial + 1),
      new GoRandom(BigInt(f.trial + 1)),
    );
    const vessels = g.ClusterOrder();
    if (vessels.length > 0) {
      vessels[0]!.AddNear(all[0]!);
      if (vessels.length > 1) vessels[0]!.AddNear(vessels[1]!);
    }
    const id = (n: Node | null) => String(n?.ID ?? 0n);
    const capture = () => ({
      nodes: g.Nodes.map(id),
      containers: Object.fromEntries(
        [...g.Containers].map(([n, children]) => [id(n), children.map(id)]),
      ),
      records: Object.fromEntries(
        [...all, ...vessels].map((n) => [
          id(n),
          {
            point: n.TopLeft ? { x: n.TopLeft.X, y: n.TopLeft.Y } : null,
            width: n.Width,
            height: n.Height,
            graph: n.Graph === g,
            container: id(n.Container),
            cluster: id(n.Cluster?.Vessel ?? null),
            vessel: n.IsClusterVessel(),
            nears: [...n.Nears].map(id).sort(),
            edges: n.Edges.map((e) => String(e.ID)),
          },
        ]),
      ),
      edges: g.Edges.map((e) => [String(e.ID), id(e.From), id(e.To)]),
      clusters: g.Clusters.size,
    });
    Cleanup(g);
    const clean = capture();
    ResetClusters(g);
    const reset = capture();
    ResetClusters(g);
    expect({ clean, reset, twice: capture() }).toEqual(f.expected);
  },
);
