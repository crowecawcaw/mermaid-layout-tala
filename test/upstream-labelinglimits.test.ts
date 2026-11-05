import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-labelinglimits.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Position } from '../src/upstream/label/label.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label, Icon } from '../src/upstream/layoutgraph/records.js';
import { placeWithLimit } from '../src/upstream/labeling/place.js';
it.each(fixtures)('matches Go label work limit $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 3; i++) {
    const n = new Node(BigInt(i + 1), 100 + i * 10, 70 + i * 10);
    n.TopLeft = new Point(i * 220, (i % 2) * 140);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
  }
  const label = (text: string, width: number, height: number) =>
    Object.assign(new Label(), { Text: text, Width: width, Height: height });
  nodes[0]!.Label = label('alpha', 40 + (f.trial % 4) * 15, 20);
  nodes[1]!.Label = label('beta', 70, 25);
  if (f.trial % 3 === 0) nodes[0]!.Icon = new Icon();
  if (f.trial % 5 === 0) {
    nodes[1]!.Label.Position = Position.InsideTopCenter;
    nodes[1]!.Label.FixPosition();
  }
  const e = g.Connect(nodes[0]!, nodes[1]!);
  e.Points = [
    new Point(100, 35),
    new Point(160, 35),
    new Point(160, 180),
    new Point(220, 180),
  ];
  e.Label = label('edge', 40 + (f.trial % 5) * 5, 20);
  if (f.trial % 4 === 0) e.Label.Position = Position.UnlockedTop;
  if (f.trial % 7 === 0) e.LabelPercentage = 0.25;
  const other = g.Connect(nodes[1]!, nodes[2]!);
  other.Points = [
    new Point(330, 180),
    new Point(380, 180),
    new Point(380, 35),
    new Point(440, 35),
  ];
  if (f.trial % 2 === 0) other.Label = label('other', 60, 20);
  let error = '';
  try {
    placeWithLimit(Background, g, BigInt(5 + f.trial * 7));
  } catch (e) {
    error = (e as Error).message;
  }
  expect({
    error,
    positions: nodes.map((n) => n.Label?.Position ?? -1),
    icons: nodes.map((n) => n.Icon?.Position ?? -1),
    edgePositions: g.Edges.map((e) => e.Label?.Position ?? -1),
    percentages: g.Edges.map((e) => e.LabelPercentage),
  }).toEqual({
    error: f.error,
    positions: f.positions,
    icons: f.icons,
    edgePositions: f.edgePositions,
    percentages: f.percentages,
  });
});
