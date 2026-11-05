import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingchannelsafety.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import { channelProposalSafe } from '../src/upstream/routing/channel-safety.js';
import { channelWireLength } from '../src/upstream/routing/channel-constraints.js';
it.each(fixtures)('matches Go channel proposal safety $trial', (f) => {
  const g = new Graph(),
    from = g.AddNode(new Node(1n, 100, 100)),
    to = g.AddNode(new Node(2n, 100, 100));
  from.TopLeft = new Point(0, 0);
  to.TopLeft = new Point(300, 200);
  const e = g.Connect(from, to);
  e.Points = [
    new Point(100, 50),
    new Point(120, 50),
    new Point(120, 250),
    new Point(300, 250),
  ];
  if (f.trial % 3 === 0) {
    const other = g.Connect(from, to);
    other.Points = [new Point(200, 150), new Point(250, 150)];
  }
  const x = 100 + (f.trial % 45) * 5,
    proposal = new Map([
      [e.Points[1]!, new Point(x, 50)],
      [e.Points[2]!, new Point(x, 250)],
    ]);
  const guard = new RouteWorkGuard(Background, 'channel test', 10000n),
    safe = channelProposalSafe(g, proposal, guard),
    length = channelWireLength(g, proposal, guard);
  expect({ safe, length, work: Number(guard.Used()) }).toEqual({
    safe: f.safe,
    length: f.length,
    work: f.work,
  });
});
