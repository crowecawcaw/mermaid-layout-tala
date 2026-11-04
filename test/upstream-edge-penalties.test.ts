import { expect, it } from 'vitest';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Background } from '../src/upstream/limits/context.js';
import { prepareNodeEdgeLength } from '../src/upstream/placementcost/edge-preparation.js';
import { edgeDirectionAndLabelPenalty } from '../src/upstream/placementcost/edge-penalties.js';

it('measures arrowhead label length in UTF-8 bytes like Go', () => {
  const g = new Graph(),
    a = new Node(1n, 10, 10),
    b = new Node(2n, 10, 10);
  g.AddNodeUnchecked(a);
  g.AddNodeUnchecked(b);
  g.turnCost = 5;
  const e = g.Connect(a, b),
    label = new Label();
  label.Text = 'éé';
  e.TargetArrowheadLabel = label;
  const options = {
    EdgeAbductions: null,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: false,
  };
  const setup = prepareNodeEdgeLength(Background, a, options);
  expect(
    edgeDirectionAndLabelPenalty(a, e, a, b, Orientation.Top, options, setup),
  ).toBe(50);
  expect(
    edgeDirectionAndLabelPenalty(a, e, a, b, Orientation.Left, options, setup),
  ).toBe(0);
});
