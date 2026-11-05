import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background, type Context } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { NodeEdgeLength } from '../src/upstream/placementcost/edge-length.js';
import { NewNodeEdgeLengthScorer } from '../src/upstream/placementcost/edge-length-scorer.js';

it('reuses preparation while reading live geometry and replaying cancellation polls', () => {
  const g = new Graph(),
    a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20);
  g.CellSize = 20;
  g.AddNewNodeToContainer(null, a);
  g.AddNewNodeToContainer(null, b);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, 0);
  g.Connect(a, b);
  const options = {
    EdgeAbductions: null,
    IncludeNodeSizes: true,
    EnforceMinimumGap: false,
    PenalizeDirection: false,
  };
  let polls = 0;
  const ctx: Context = {
    Done: () => null,
    Err: () => {
      polls++;
      return null;
    },
  };
  const scorer = NewNodeEdgeLengthScorer(a, options);
  expect(scorer.Score(ctx)).toBe(NodeEdgeLength(Background, a, options));
  const initialPolls = polls;
  polls = 0;
  b.TopLeft = new Point(150, 0);
  expect(scorer.Score(ctx)).toBe(NodeEdgeLength(Background, a, options));
  expect(polls).toBe(initialPolls);
  scorer.Close();
  scorer.Close();
  expect(() => scorer.Score(Background)).toThrow(
    'EdgeLength: scorer is closed',
  );
});
