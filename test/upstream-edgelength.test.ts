import { it } from 'vitest';
import fixtures from './fixtures/upstream-edgelength.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { NodeEdgeLength } from '../src/upstream/placementcost/edge-length.js';

it.each(fixtures)('matches Go edge scoring for case $trial', (f) => {
  const g = new Graph();
  g.CellSize = f.cell;
  g.Directions.set(null, f.direction);
  const nodes = f.nodes.map((v, i) => {
    const n = new Node(BigInt(i + 1), v.w, v.h);
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(v.x, v.y);
    return n;
  });
  f.edges.forEach((e, i) => {
    const edge = g.Connect(nodes[0]!, nodes[i + 1]!);
    edge.SourceArrowhead = e.source;
    edge.TargetArrowhead = e.target;
  });
  const values = Array.from({ length: 8 }, (_, mask) =>
    NodeEdgeLength(Background, nodes[0]!, {
      EdgeAbductions: null,
      IncludeNodeSizes: !!(mask & 1),
      EnforceMinimumGap: !!(mask & 2),
      PenalizeDirection: !!(mask & 4),
    }),
  );
  compare(values, f.expected);
});
