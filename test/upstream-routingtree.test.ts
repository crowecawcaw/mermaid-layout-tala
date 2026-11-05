import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingtree.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Tree } from '../src/upstream/layoutgraph/records.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { addPorts } from '../src/upstream/routing/ovg-ports.js';
import { addTreeNodes } from '../src/upstream/routing/tree-routes.js';
it.each(fixtures)('matches Go tree visibility nodes $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 60, 50));
  a.TopLeft = new Point(10, 20);
  a.SetShape(f.shapeA);
  b.SetShape(f.shapeB);
  const orientation = 4 + (trial % 4);
  switch (orientation) {
    case Orientation.Top:
      b.TopLeft = new Point(18 + (trial % 17), -150);
      break;
    case Orientation.Bottom:
      b.TopLeft = new Point(18 + (trial % 17), 200);
      break;
    case Orientation.Left:
      b.TopLeft = new Point(-150, 20 + (trial % 11));
      break;
    case Orientation.Right:
      b.TopLeft = new Point(200, 20 + (trial % 11));
      break;
  }
  const e = trial % 2 === 0 ? g.Connect(a, b) : g.Connect(b, a),
    tree = new Tree(b);
  tree.SentinelEdge = e;
  tree.Orientation = orientation;
  g.NodeToTree.set(b, tree);
  const ovg = new OVG(g.Nodes);
  addPorts(ovg, g, new OVGBuildGuard(Background, defaultOVGBuildLimits()));
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let error = '';
  try {
    addTreeNodes(ovg, g, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  expect(ovg.Nodes.map((n) => ({ x: n.X, y: n.Y }))).toEqual(f.points);
  expect((ovg.Ports.get(b) ?? []).map((p) => ({ x: p.X, y: p.Y }))).toEqual(
    f.ports,
  );
});
