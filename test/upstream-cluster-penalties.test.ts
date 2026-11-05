import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { addClusterArrangementCosts } from '../src/upstream/placementcost/cluster-penalties.js';

it('penalizes horizontal edges to a row cluster and rewards centered vertical edges', () => {
  const graph = new Graph(),
    member = new Node(1n, 10, 10),
    external = new Node(2n, 10, 10),
    vessel = new Node(3n, 30, 10);
  for (const node of [member, external, vessel]) graph.AddNodeUnchecked(node);
  member.TopLeft = new Point(0, 0);
  vessel.TopLeft = new Point(0, 0);
  external.TopLeft = new Point(50, 0);
  const cluster = new Cluster();
  cluster.Vessel = vessel;
  cluster.Nodes = [member];
  cluster.Arrangement = 'Row';
  member.Cluster = cluster;
  graph.turnCost = 10;
  expect(
    addClusterArrangementCosts(member, member, external, Orientation.Left, 5),
  ).toBe(35);
  external.TopLeft = new Point(10, 50);
  expect(
    addClusterArrangementCosts(member, member, external, Orientation.Top, 5),
  ).toBe(5);
});
