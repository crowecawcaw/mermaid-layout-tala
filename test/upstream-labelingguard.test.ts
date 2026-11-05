import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-labelingguard.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  LabelPlacementWorkGuard,
  nodeOverlapCount,
  partialNodeOverlapCount,
  nodeOverlapArea,
  edgeOverlapCount,
  collectLabelPlacementAncestors,
  isLabelPlacementDescendantOf,
} from '../src/upstream/labeling/guard.js';
it.each(fixtures)('matches Go label placement guard $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const n = new Node(BigInt(i + 1), 30 + i * 10, 30 + i * 5);
    n.TopLeft = new Point(i * 20 + (f.trial % 5) * 5, i * 13);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  const e = g.Connect(nodes[0]!, nodes[3]!);
  e.Points = [
    new Point(-50, (f.trial % 5) * 10),
    new Point(200, (f.trial % 5) * 10),
  ];
  const guard = new LabelPlacementWorkGuard(Background, 'PlaceLabels', 100000n),
    delta = (f.trial % 3) * 10,
    count = nodeOverlapCount(nodes[0]!, nodes.slice(1), delta, guard),
    partial = partialNodeOverlapCount(nodes[0]!, nodes.slice(1), delta, guard),
    [area, areaCount] = nodeOverlapArea(
      nodes[0]!,
      nodes.slice(1),
      delta,
      f.trial % 2 === 0,
      guard,
    ),
    edgeCount = edgeOverlapCount(nodes[1]!, g.Edges, 0, guard),
    ancestors = collectLabelPlacementAncestors(nodes[1]!, guard).map((n) =>
      Number(n.ID),
    ),
    desc = isLabelPlacementDescendantOf(nodes[1]!, nodes[0]!, guard);
  expect({
    count,
    partial,
    area,
    areaCount,
    edgeCount,
    ancestors,
    desc,
    work: Number(guard.used),
  }).toEqual({
    count: f.count,
    partial: f.partial,
    area: f.area,
    areaCount: f.areaCount,
    edgeCount: f.edgeCount,
    ancestors: f.ancestors,
    desc: f.desc,
    work: f.work,
  });
});
