import { it } from 'vitest';
import fixtures from './fixtures/upstream-routingovg.json';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import {
  OVGNode,
  portDirectionsTransformed,
} from '../src/upstream/routing/ovg-node.js';
import { OVGEdge } from '../src/upstream/routing/ovg-edge.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go visibility graph metadata $trial', (f) => {
  const trial = f.trial,
    owner = new Node(1n, 5 + (trial % 31), 6 + (trial % 29)),
    other = new Node(2n, 10, 10);
  owner.TopLeft = new Point((trial % 51) - 25, (trial % 37) - 18);
  const a = new OVGNode(
      new Point(((trial * 11) % 101) - 50, ((trial * 13) % 83) - 41),
    ),
    b = new OVGNode(
      new Point(((trial * 17) % 101) - 50, ((trial * 19) % 83) - 41),
    ),
    c = new OVGNode(
      new Point(((trial * 23) % 101) - 50, ((trial * 29) % 83) - 41),
    );
  if (trial % 3 === 0) b.Point = a.Point.Copy();
  if (trial % 5 === 0) c.X = a.X;
  if (trial % 7 === 0) c.Y = a.Y;
  for (let i = 0; i < trial % 12; i++)
    a.addPortOwner(owner, ((trial + i) % 11) - 1, i % 4 === 0);
  if (trial % 2 === 0) {
    a.addPortOwner(other, Orientation.Top, false);
    b.addPortOwner(other, Orientation.Right, true);
  }
  if (trial % 4 === 0) a.setCenterPort(owner);
  const [directions, directionsOk] = a.portDirectionsFor(owner),
    transformed = portDirectionsTransformed(directions, (d) => (d + 3) % 9),
    checks = Array.from({ length: 9 }, (_, i) => a.hasPortDirection(owner, i));
  const e1 = new OVGEdge(a, b),
    e2 = new OVGEdge(b, c);
  compare(
    {
      distance: a.distanceToBoundary(owner),
      directions,
      directionsOk,
      transformed,
      checks,
      center: a.isCenterPortOf(owner),
      isPort: a.isPort(),
      sharesOwner: a.sharesPortOwner(b),
      vertical: e1.isVertical(),
      horizontal: e1.isHorizontal(),
      sharePoints: e1.sharePoints(e2),
    },
    f.expected,
  );
});
