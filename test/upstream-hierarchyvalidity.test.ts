import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchyvalidity.json';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  Hierarchy,
  TriangleArrowhead,
} from '../src/upstream/layoutgraph/records.js';
import {
  IsHorizontal,
  countEdgeDirection,
  minimumWorkflowExtentFits,
  is1N1,
  isValid,
} from '../src/upstream/hierarchy/validity.js';
it.each(fixtures)('matches Go hierarchy validity $trial', (f) => {
  const g = new Graph(),
    h = new Hierarchy(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new Node(BigInt(i + 1), 40 + i * 10, 30 + i * 5);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
    h.Levels().set(n, i % (f.trial % 4 === 0 ? 4 : 3));
  }
  h.LevelCount = f.trial % 4 === 0 ? 4 : 3;
  const pairs = [
    [0, 1],
    [0, 4],
    [1, 2],
    [4, 2],
    [3, 4],
    [4, 5],
  ];
  pairs.forEach((pair, i) => {
    if ((f.trial + i) % 5 === 0) return;
    const e = g.Connect(nodes[pair[0]!]!, nodes[pair[1]!]!);
    if ((f.trial + i) % 4 !== 0) e.TargetArrowhead = TriangleArrowhead;
    if ((f.trial + i) % 9 === 0) e.SourceArrowhead = TriangleArrowhead;
  });
  if (f.trial % 3 === 0) g.Connect(nodes[1]!, nodes[1]!);
  if (f.trial % 6 === 0) g.Directions.set(null, Orientation.Right);
  const [forward, back] = countEdgeDirection(h, g);
  expect({
    horizontal: IsHorizontal(g.Nodes),
    forward,
    back,
    extent: minimumWorkflowExtentFits(h, g),
    oneNOne: is1N1(h, []),
    valid: isValid(h, g, [], 1 + (f.trial % 2), 1 + (f.trial % 3)),
  }).toEqual({
    horizontal: f.horizontal,
    forward: f.forward,
    back: f.back,
    extent: f.extent,
    oneNOne: f.oneNOne,
    valid: f.valid,
  });
});
