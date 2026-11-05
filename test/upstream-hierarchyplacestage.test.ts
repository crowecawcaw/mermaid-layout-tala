import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchyplacestage.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Hierarchy } from '../src/upstream/layoutgraph/records.js';
import { Place } from '../src/upstream/hierarchy/place.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go hierarchy placement stage $trial', (f) => {
  const g = new Graph(),
    h = new Hierarchy(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new Node(BigInt(i + 1), 40 + i * 5, 30 + (i % 3) * 10);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
    n.Hierarchy = h;
    h.Levels().set(n, i % 4);
  }
  h.LevelCount = 4;
  const pairs = [
    [0, 1],
    [0, 3],
    [1, 2],
    [2, 3],
    [0, 5],
  ];
  if (f.trial % 2 === 0) pairs.push([4, 3]);
  if (f.trial % 3 === 0) pairs.push([1, 5]);
  for (const p of pairs) g.Connect(nodes[p[0]!]!, nodes[p[1]!]!);
  g.Directions.set(
    null,
    [O.Top, O.Bottom, O.Left, O.Right, O.NONE][f.trial % 5]!,
  );
  if (f.trial % 11 === 0) nodes[0]!.FixedTopLeft = nodes[0]!.TopLeft!.Copy();
  let error = '';
  try {
    Place(Background, g, null, null);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y, n.Width, n.Height]),
    f.geometry,
  );
});
