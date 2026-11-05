import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingtrace.json';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import { Point } from '../src/upstream/geo/point.js';
import { traceToShapeBorder } from '../src/upstream/routing/trace.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go shape border tracing $shape $trial', (f) => {
  const a = new Node(1n, 80, 60);
  a.SetShape(f.shape);
  a.TopLeft = new Point(10, 20);
  a.Is3D = f.trial % 3 === 1;
  a.IsMultiple = f.trial % 3 === 2;
  let b = new Node(2n, 70, 50);
  b.SetShape(f.shape);
  b.TopLeft = new Point(200, 140);
  b.Is3D = f.trial % 4 === 1;
  b.IsMultiple = f.trial % 4 === 2;
  if (f.self) b = a;
  const pa = a.TopLeft,
    pb = b.TopLeft,
    e = new Edge(a, b);
  e.Points = f.input.map((p) => new Point(p.x, p.y));
  traceToShapeBorder(e);
  compare(
    e.Points.map((p) => ({ x: p.X, y: p.Y })),
    f.expected,
  );
  compare({ x: a.TopLeft!.X, y: a.TopLeft!.Y }, f.aPosition);
  compare({ x: b.TopLeft!.X, y: b.TopLeft!.Y }, f.bPosition);
  expect(a.TopLeft).toBe(pa);
  expect(b.TopLeft).toBe(pb);
});
