import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchycompound.json';
import { Background } from '../src/upstream/limits/context.js';
import { GoRandom } from '../src/random.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { TriangleArrowhead } from '../src/upstream/layoutgraph/records.js';
import { PlaceCompound } from '../src/upstream/hierarchy/compound.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go compound hierarchy placement $trial', (f) => {
  const g = new Graph(),
    outer: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new Node(BigInt(i + 1), 120, 90);
    n.TopLeft = new Point(i * 400, 300);
    g.AddNewNodeToContainer(null, n);
    outer.push(n);
  }
  const connect = (a: Node, b: Node) => {
    g.Connect(a, b).TargetArrowhead = TriangleArrowhead;
  };
  for (const p of [
    [0, 2],
    [0, 3],
    [1, 3],
    [2, 4],
    [3, 5],
  ])
    connect(outer[p[0]!]!, outer[p[1]!]!);
  const container = outer[3]!;
  container.Width = 300;
  container.Height = 220;
  const children: Node[] = [];
  for (let i = 0; i < 2; i++) {
    const n = new Node(BigInt(i + 7), 80, 50);
    n.TopLeft = new Point(
      container.TopLeft!.X + 40 + i * 120,
      container.TopLeft!.Y + 60 + i * 60,
    );
    g.AddNewNodeToContainer(container, n);
    children.push(n);
  }
  connect(children[0]!, children[1]!);
  connect(children[1]!, outer[5]!);
  g.Directions.set(container, O.Right);
  g.Directions.set(null, [O.Top, O.Bottom, O.Left, O.Right][f.trial % 4]!);
  if (f.trial % 11 === 0)
    children[0]!.FixedTopLeft = children[0]!.TopLeft!.Copy();
  let changed = false,
    error = '';
  try {
    changed = PlaceCompound(Background, g, new GoRandom(BigInt(f.trial + 1)));
  } catch (e) {
    error = (e as Error).message;
  }
  const nodes = [...outer, ...children];
  expect({
    error,
    changed,
    levels: nodes.map((n) => (n.Hierarchy ? n.Hierarchy.Levels().get(n)! : -1)),
  }).toEqual({ error: f.error, changed: f.changed, levels: f.levels });
  compare(
    nodes.map((n) => [n.TopLeft!.X, n.TopLeft!.Y, n.Width, n.Height]),
    f.geometry,
  );
});
