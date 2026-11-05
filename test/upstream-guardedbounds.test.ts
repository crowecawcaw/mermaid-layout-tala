import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-guardedbounds.json';
import { Point } from '../src/upstream/geo/point.js';
import { Position } from '../src/upstream/label/label.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label, Icon } from '../src/upstream/layoutgraph/records.js';
import { FixedBoundingBox } from '../src/upstream/graphbounds/bounds.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go guarded bounds $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 1 + (trial % 5); i++) {
    const n = g.AddNode(
      new Node(BigInt(i + 1), 40 + i * 10 + 0.5, 30 + i * 7 + 0.25),
    );
    n.TopLeft = new Point(
      ((trial * 7 + i * 31) % 120) - 0.5,
      ((trial * 11 + i * 23) % 90) + 0.25,
    );
    if ((trial + i) % 3 === 0) {
      n.Label = new Label();
      Object.assign(n.Label, {
        Position: 1 + ((trial + i) % 12),
        Width: 30 + i * 4,
        Height: 15 + i * 3,
      });
    }
    if ((trial + i) % 7 === 0) {
      n.Icon = new Icon();
      n.Icon.Position = Position.OutsideTopCenter;
    }
    if ((trial + i) % 5 === 0) n.FixedTopLeft = new Point(i, i * 2);
    n.Is3D = (trial + i) % 9 === 0;
    n.IsMultiple = (trial + i) % 11 === 0;
    nodes.push(n);
  }
  const guard = {
      used: 0,
      Step() {
        this.used++;
      },
      Finish() {},
    },
    [tl, br] = FixedBoundingBox(nodes, guard);
  compare(
    { tl: { x: tl.X, y: tl.Y }, br: { x: br.X, y: br.Y } },
    { tl: f.tl, br: f.br },
  );
  expect(guard.used).toBe(f.work);
});
