import { SizedOptimizer } from '../src/upstream/placement/sized-optimizer.js';
import { SizelessOptimizer } from '../src/upstream/placement/sizeless-optimizer.js';
import { GoRandom } from '../src/random.js';
import { initializeByGraphDistance } from '../src/upstream/placement/stress-initialize.js';
import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-initialize.json';
import { compare } from './helpers/compare.js';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { initializeNodes } from '../src/upstream/placement/initialize.js';

it.each(fixtures)('matches Go initialization $trial', (f) => {
  const g = new Graph();
  g.CellSize = f.cell;
  const nodes = Array.from({ length: f.count }, (_, j) => {
    const n = new Node(BigInt(j + 1), 20 + j * 5, 20 + j * 3);
    g.AddNewNodeToContainer(null, n);
    return n;
  });
  if (f.fixed) nodes[0]!.FixedTopLeft = new Point(f.trial % 60, f.trial % 45);
  f.edges.forEach((r, j) => {
    const e = g.Connect(nodes[j]!, nodes[j + 1]!);
    e.SourceArrowhead = r.source;
    e.TargetArrowhead = r.target;
  });
  const stress = initializeByGraphDistance(Background, g);
  compare(stress, f.stress);
  if (stress) {
    compare(
      nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
      f.stressPositions,
    );
    for (const n of nodes) n.TopLeft = null;
  }
  initializeNodes(Background, g);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.positions,
  );
  const rng = new GoRandom(BigInt(f.trial + 1));
  new SizelessOptimizer(Background, g, rng).optimize(Background, 1.5);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
    f.optimized,
  );
  compare(String(rng.int63()), f.nextRandom);
  for (const n of nodes) {
    n.TopLeft!.X *= g.CellSize * 3;
    n.TopLeft!.Y *= g.CellSize * 3;
  }
  const sizedRandom = new GoRandom(BigInt(f.trial + 101));
  const sized = new SizedOptimizer(Background, g, null, null, sizedRandom, []);
  const changed = sized.optimize(Background, 0.5);
  compare(
    {
      changed,
      positions: nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y]),
      next: String(sizedRandom.int63()),
    },
    { changed: f.sizedChanged, positions: f.sizedPositions, next: f.sizedNext },
  );
});

it('restores original positions when a disconnected node is missed', () => {
  const g = new Graph();
  g.CellSize = 20;
  const a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20),
    c = new Node(3n, 20, 20);
  for (const node of [a, b, c]) g.AddNewNodeToContainer(null, node);
  const original = new Point(4, 5);
  a.TopLeft = original;
  g.Connect(a, b);
  expect(() => initializeNodes(Background, g)).toThrow(
    'missed initializing node',
  );
  expect(a.TopLeft).toBe(original);
  expect([original.X, original.Y]).toEqual([4, 5]);
  expect(b.TopLeft).toBeNull();
  expect(c.TopLeft).toBeNull();
});

it('restores geometry and placement costs when the optimizer exhausts its work limit', () => {
  const g = new Graph();
  g.CellSize = 20;
  const nodes = Array.from({ length: 4 }, (_, i) => {
    const n = new Node(BigInt(i + 1), 20, 20);
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(i * 2, 0);
    return n;
  });
  for (let i = 1; i < nodes.length; i++) g.Connect(nodes[i - 1]!, nodes[i]!);
  const points = nodes.map((n) => n.TopLeft!),
    before = points.map((p) => [p.X, p.Y]);
  const optim = new SizelessOptimizer(Background, g, new GoRandom(10n));
  g.turnCost = 3;
  g.edgeLengthCache!.set(77n, 9);
  expect(() => optim.optimizeWithLimit(Background, 1, 30n)).toThrow(
    'work exceeds limit',
  );
  expect(nodes.map((n) => n.TopLeft)).toEqual(points);
  expect(nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y])).toEqual(before);
  expect(g.turnCost).toBe(3);
  expect(g.edgeLengthCache!.get(77n)).toBe(9);
});

it('restores sized optimization state on a work-limit failure', () => {
  const g = new Graph();
  g.CellSize = 20;
  const nodes = Array.from({ length: 4 }, (_, i) => {
    const n = new Node(BigInt(i + 1), 20, 20);
    g.AddNewNodeToContainer(null, n);
    n.TopLeft = new Point(i * 100, 0);
    return n;
  });
  for (let i = 1; i < nodes.length; i++) g.Connect(nodes[i - 1]!, nodes[i]!);
  const pointers = nodes.map((n) => n.TopLeft!),
    before = pointers.map((p) => [p.X, p.Y]);
  const optim = new SizedOptimizer(
    Background,
    g,
    null,
    null,
    new GoRandom(13n),
    [],
  );
  g.turnCost = 4;
  g.edgeLengthCache!.set(99n, 12);
  expect(() => optim.optimizeWithLimit(Background, 0.5, 40n)).toThrow(
    'work exceeds limit',
  );
  nodes.forEach((n, i) => expect(n.TopLeft).toBe(pointers[i]));
  expect(nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y])).toEqual(before);
  expect(g.turnCost).toBe(4);
  expect(g.edgeLengthCache!.get(99n)).toBe(12);
});
