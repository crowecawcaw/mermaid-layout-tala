import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { addTableCrossingCosts } from '../src/upstream/placementcost/table-crossings.js';

it('charges for reversed column order on the same side only', () => {
  const graph = new Graph(),
    first = new Node(1n, 10, 10),
    other = new Node(2n, 10, 10),
    target = new Node(3n, 10, 10);
  for (const node of [first, other, target]) graph.AddNodeUnchecked(node);
  first.TopLeft = new Point(0, 0);
  other.TopLeft = new Point(0, 40);
  target.TopLeft = new Point(100, 0);
  const edge = graph.Connect(first, target),
    otherEdge = graph.Connect(other, target);
  edge.FromTableColumnIndex = 0;
  edge.ToTableColumnIndex = 2;
  otherEdge.FromTableColumnIndex = 0;
  otherEdge.ToTableColumnIndex = 1;
  graph.crossingCost = 7;
  expect(
    addTableCrossingCosts(
      Background,
      first,
      edge,
      first,
      target,
      Orientation.Left,
      10,
    ),
  ).toBe(17);
  otherEdge.ToTableColumnIndex = 3;
  expect(
    addTableCrossingCosts(
      Background,
      first,
      edge,
      first,
      target,
      Orientation.Left,
      10,
    ),
  ).toBe(10);
  const [ctx, cancel] = WithCancel();
  cancel();
  expect(() =>
    addTableCrossingCosts(
      ctx,
      first,
      edge,
      first,
      target,
      Orientation.Left,
      10,
    ),
  ).toThrow('EdgeLength: context canceled');
});
