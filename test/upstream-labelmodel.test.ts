import { it } from 'vitest';
import fixtures from './fixtures/upstream-labelmodel.json';
import { compare } from './helpers/compare.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label, Icon } from '../src/upstream/layoutgraph/records.js';
import { Position } from '../src/upstream/label/label.js';
import {
  Initialize,
  labelPositionPreferenceTranches,
} from '../src/upstream/labeling/model.js';

it.each(fixtures)('matches Go label initialization for $shape $trial', (f) => {
  const graph = new Graph(),
    node = new Node(1n, 100, 100);
  graph.AddNewNodeToContainer(null, node);
  node.SetShape(f.shape);
  node.isContainer = f.trial % 2 === 1;
  node.Label = new Label();
  node.Icon = new Icon();
  if (f.trial >= 2) {
    node.Label.Position = Position.OutsideTopCenter;
    node.Icon.Position = Position.InsideTopLeft;
  }
  const tranches = labelPositionPreferenceTranches(node).map((t) =>
    t.length === 0 ? null : t,
  );
  Initialize(graph);
  compare(
    {
      tranches,
      position: node.Label.Position,
      labelFixed: node.Label.PositionFixed(),
      iconFixed: node.Icon.PositionFixed(),
    },
    {
      tranches: f.tranches,
      position: f.position,
      labelFixed: f.labelFixed,
      iconFixed: f.iconFixed,
    },
  );
});
