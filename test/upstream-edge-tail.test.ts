import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { HerdAssignment } from '../src/upstream/layoutgraph/records.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import { prepareNodeEdgeLength } from '../src/upstream/placementcost/edge-preparation.js';
import { finishNodeEdgeLength } from '../src/upstream/placementcost/edge-tail.js';

it('charges distance to the nearest placed neighbor and an overshot herd fence', () => {
  const g = new Graph(),
    n = new Node(1n, 10, 10),
    near = new Node(2n, 10, 10);
  g.CellSize = 20;
  g.AddNodeUnchecked(n);
  g.AddNodeUnchecked(near);
  n.TopLeft = new Point(0, 0);
  near.TopLeft = new Point(30, 0);
  n.Nears.add(near);
  const herd = new HerdAssignment();
  herd.Orientation = Orientation.Left;
  herd.Val = 5;
  n.HerdAssignment = herd;
  const scratch = prepareNodeEdgeLength(Background, n, {
    EdgeAbductions: null,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: false,
  });
  expect(finishNodeEdgeLength(Background, n, true, scratch, 0)).toBe(45);
  near.TopLeft = null;
  expect(finishNodeEdgeLength(Background, n, true, scratch, 0)).toBe(25);
  const [ctx, cancel] = WithCancel();
  cancel();
  expect(() => finishNodeEdgeLength(ctx, n, true, scratch, 0)).toThrow(
    'EdgeLength: context canceled',
  );
});
