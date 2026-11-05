import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingroutedbox.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { newWorkGuard } from '../src/upstream/packing/guard.js';
import {
  binPackCanUseRoutedContainerBox,
  routedContainerRoutesStayInsideShrink,
} from '../src/upstream/packing/routed-container.js';
it.each(fixtures)('matches Go routed container decision $trial', (f) => {
  const g = new Graph(),
    root = new Node(1n, 200, 160 - (f.trial % 4) * 10),
    ext = new Node(2n, 40, 30),
    child = new Node(3n, 40, 30);
  root.TopLeft = new Point(0, 0);
  root.isContainer = true;
  ext.TopLeft = new Point(80, -150);
  child.TopLeft = new Point(80, 50);
  g.AddNewNodeToContainer(null, root);
  g.AddNewNodeToContainer(null, ext);
  g.AddNewNodeToContainer(root, child);
  const e = g.Connect(root, ext);
  e.Points = [new Point(100, 0), new Point(100, -150)];
  if (f.trial % 5 === 0)
    e.Points = [
      new Point(100, 0),
      new Point(100, -50),
      new Point(130, -50),
      new Point(130, -150),
    ];
  if (f.trial % 7 === 0) e.IsCurve = true;
  const original = new Box(new Point(0, 0), 200, 160);
  let guard = newWorkGuard(Background, 1000000n);
  expect(binPackCanUseRoutedContainerBox(g, root, original, [e], guard)).toBe(
    f.decision,
  );
  expect(Number(guard.Used())).toBe(f.work);
  guard = newWorkGuard(Background, 1000000n);
  expect(
    routedContainerRoutesStayInsideShrink([e], original, root.Box, guard),
  ).toBe(f.preserved);
  expect(Number(guard.Used())).toBe(f.routeWork);
});
