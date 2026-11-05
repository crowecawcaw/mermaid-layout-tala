import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  GraphEdgeCrossings,
  ContainerAlignmentCost,
} from '../src/upstream/placementcost/graph-cost.js';

it('counts crossing independent edges and scores misaligned peer containers', () => {
  const graph = new Graph();
  const nodes = [
    [0, 0],
    [100, 100],
    [0, 100],
    [100, 0],
  ].map(([x, y], i) => {
    const n = new Node(BigInt(i + 1), 10, 10);
    n.TopLeft = new Point(x!, y!);
    graph.AddNodeUnchecked(n);
    return n;
  });
  graph.Connect(nodes[0]!, nodes[1]!);
  graph.Connect(nodes[2]!, nodes[3]!);
  graph.Connect(nodes[0]!, nodes[2]!);
  expect(GraphEdgeCrossings(Background, graph)).toBe(1);
  nodes[0]!.isContainer = true;
  nodes[1]!.isContainer = true;
  graph.nonCenterPortCost = 7;
  expect(ContainerAlignmentCost(Background, graph)).toBe(7);
  nodes[1]!.TopLeft = new Point(0, 100);
  expect(ContainerAlignmentCost(Background, graph)).toBe(0);
});
