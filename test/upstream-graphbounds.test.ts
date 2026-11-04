import { it } from 'vitest';
import fixtures from './fixtures/upstream-graphbounds.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { ArrowheadTopLeft } from '../src/upstream/labelgeom/arrowhead.js';
import {
  edgeBoundingBoxValues,
  BoundingBox,
} from '../src/upstream/layoutgraph/graph-bounds.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go graph and arrowhead-label bounds $trial', (f) => {
  const g = new Graph(),
    a = g.AddNode(new Node(1n, 61.5, 43.5)),
    b = g.AddNode(new Node(2n, 40.25, 70.25));
  a.TopLeft = new Point(-30.5, 45.5);
  b.TopLeft = new Point(400.5, -100.5);
  const e = g.Connect(a, b);
  e.Points = f.points.map((p) => new Point(p.x, p.y));
  e.SourceArrowhead = f.source;
  e.TargetArrowhead = f.target;
  e.LabelPercentage = f.percentage;
  e.Label = Object.assign(new Label(), f.label);
  e.SourceArrowheadLabel = Object.assign(new Label(), f.sourceLabel);
  e.TargetArrowheadLabel = Object.assign(new Label(), f.targetLabel);
  const point = (p: Point | null) => (p === null ? null : { x: p.X, y: p.Y });
  compare(
    {
      source: point(
        ArrowheadTopLeft(
          e.Points,
          false,
          e.SourceArrowhead,
          e.TargetArrowhead,
          e.SourceArrowheadLabel.Width,
          e.SourceArrowheadLabel.Height,
        ),
      ),
      target: point(
        ArrowheadTopLeft(
          e.Points,
          true,
          e.SourceArrowhead,
          e.TargetArrowhead,
          e.TargetArrowheadLabel.Width,
          e.TargetArrowheadLabel.Height,
        ),
      ),
      edge: edgeBoundingBoxValues(e).map(point),
      graph: BoundingBox(g).map(point),
    },
    f.expected,
  );
});
