import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsearch.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { OVGEdgeRouter } from '../src/upstream/routing/edge-router.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go Dijkstra route search $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 70, 50));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(150, 100);
  const edge = g.Connect(a, b);
  if (trial % 2 === 0) edge.TargetArrowhead = 'triangle';
  if (trial % 5 === 0) {
    edge.SourceArrowheadLabel = new Label();
    Object.assign(edge.SourceArrowheadLabel, {
      Text: 'x',
      Width: 20,
      Height: 10,
    });
  }
  const ovg = new OVG(g.Nodes),
    points = [
      [40, 30],
      [80, 30],
      [115, 30],
      [115, 125],
      [150, 125],
      [40, 60],
      [40, 80],
      [185, 80],
      [185, 100],
      [185, 125],
    ],
    nodes = points.map(([x, y], i) => {
      const n = ovg.AddNode(new OVGNode(new Point(x!, y!)));
      n.Index = i;
      return n;
    });
  nodes[0]!.IsNodeCenter = true;
  nodes[9]!.IsNodeCenter = true;
  nodes[1]!.addPortOwner(a, O.Right, true);
  nodes[5]!.addPortOwner(a, O.Bottom, true);
  nodes[4]!.addPortOwner(b, O.Left, true);
  nodes[8]!.addPortOwner(b, O.Top, true);
  ovg.Ports.set(a, [nodes[1]!, nodes[5]!]);
  ovg.Ports.set(b, [nodes[4]!, nodes[8]!]);
  ovg.Centers.set(a, nodes[0]!);
  ovg.Centers.set(b, nodes[9]!);
  for (const [x, y] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 9],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
  ] as [number, number][])
    ovg.Connect(nodes[x]!, nodes[y]!);
  if (trial % 3 === 0) nodes[2]!.IsNearPort = new Set([a]);
  let router: OVGEdgeRouter | null = null,
    ids: number[] | null = null,
    cost = 0,
    error = '';
  try {
    router = new OVGEdgeRouter(
      Background,
      'Default',
      ovg,
      g,
      [],
      [edge],
      BigInt(f.limit),
    );
    const [path, value] = router.search(Background, edge);
    ids = path.map((n) => n.Index);
    cost = value;
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(router?.work.Used() ?? 0n).toBe(BigInt(f.work));
  expect(ids).toEqual(f.ids);
  compare(cost, f.cost);
});
