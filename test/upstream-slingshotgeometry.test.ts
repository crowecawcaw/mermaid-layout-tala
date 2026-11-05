import { it } from 'vitest';
import fixtures from './fixtures/upstream-slingshotgeometry.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import {
  undershot,
  overshot,
  isOnFlightPlan,
  preferLaunchingVertically,
} from '../src/upstream/routing/slingshot-geometry.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go slingshot geometry $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 30, 40));
    n.TopLeft = new Point(
      ((trial * 7 + i * 31) % 180) - 80,
      ((trial * 11 + i * 23) % 180) - 80,
    );
    nodes.push(n);
  }
  for (let i = 1; i < 6; i++) {
    g.Connect(nodes[0]!, nodes[i]!);
    if (i % 2 === 0) g.Connect(nodes[1]!, nodes[i]!);
  }
  const prev = new OVGNode(
      new Point(((trial * 13) % 220) - 110, ((trial * 17) % 220) - 110),
    ),
    next = new OVGNode(
      new Point(((trial * 19) % 220) - 110, ((trial * 23) % 220) - 110),
    );
  if (trial % 3 === 0) next.X = prev.X;
  if (trial % 5 === 0) next.Y = prev.Y;
  const orientation = trial % 9,
    vertical = trial % 2 === 0,
    [preferred, strong] = preferLaunchingVertically(
      nodes[0]!,
      nodes[1]!,
      orientation,
    );
  compare(
    {
      undershot: undershot(prev, nodes[1]!, orientation, vertical),
      overshot: overshot(
        prev,
        nodes[1]!,
        orientation,
        vertical,
        trial % 3 === 0,
      ),
      flight: isOnFlightPlan(prev, next, orientation, vertical),
      preferred,
      strong,
    },
    f.expected,
  );
});
