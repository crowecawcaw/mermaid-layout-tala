import { it } from 'vitest';
import fixtures from './fixtures/upstream-clusterstage.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { reconnectEdge } from '../src/upstream/layoutgraph/edge-topology.js';
import { Point } from '../src/upstream/geo/point.js';
import { AddCluster } from '../src/upstream/grouping/clusters.js';
import { OptimizeClusters } from '../src/upstream/placement/cluster-flip.js';
it.each(fixtures)('matches Go cluster optimization $trial', (f) => {
  const g = new Graph();
  g.CellSize = 60;
  const a = new Node(1n, 40, 40),
    b = new Node(2n, 40, 40),
    c = new Node(3n, 40, 40),
    d = new Node(4n, 40, 40);
  a.TopLeft = new Point(100 + (f.trial % 30), 0);
  b.TopLeft = new Point(100 + (f.trial % 30), 400);
  c.TopLeft = new Point(100, 140);
  d.TopLeft = new Point(100, 240);
  for (const n of [a, b, c, d]) g.AddNewNodeToContainer(null, n);
  g.Connect(a, c);
  g.Connect(a, d);
  g.Connect(c, b);
  g.Connect(d, b);
  const vessel = new Node(5n, 40, 140);
  vessel.TopLeft = new Point(100, 140);
  vessel.isClusterVessel = true;
  const cluster = new Cluster();
  cluster.Nodes = [c, d];
  cluster.Graph = g;
  cluster.Arrangement = 'Column';
  cluster.DesiredArrangement = 'Row';
  cluster.Vessel = vessel;
  AddCluster(g, cluster);
  for (const edge of g.Edges) {
    if (edge.From.Cluster === cluster) {
      cluster.EdgeAbductions.push({
        Edge: edge,
        OriginallyFrom: edge.From,
        OriginallyTo: null,
        CurrentFrom: vessel,
        CurrentTo: edge.To,
      });
      reconnectEdge(edge, vessel, false);
    }
    if (edge.To.Cluster === cluster) {
      cluster.EdgeAbductions.push({
        Edge: edge,
        OriginallyFrom: null,
        OriginallyTo: edge.To,
        CurrentTo: vessel,
        CurrentFrom: edge.From,
      });
      reconnectEdge(edge, vessel, true);
    }
  }
  const changed = OptimizeClusters(Background, g);
  compare(
    {
      changed,
      arrangement: cluster.Arrangement,
      desired: cluster.DesiredArrangement,
      padding: cluster.Padding,
      nodes: [a, b, c, d, vessel].map((n) => [
        n.TopLeft!.X,
        n.TopLeft!.Y,
        n.Width,
        n.Height,
      ]),
    },
    {
      changed: f.changed,
      arrangement: f.arrangement,
      desired: f.desired,
      padding: f.padding,
      nodes: f.nodes,
    },
  );
});
