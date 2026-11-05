import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchyeligibility.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  Candidates,
  isEligibleContainer,
  shapeCanBeContainer,
  countHierarchyStructuralEdges,
} from '../src/upstream/hierarchy/eligibility.js';
it.each(fixtures)('matches Go hierarchy eligibility $trial', (f) => {
  const shapes = [
    '',
    'Square',
    'Package',
    'StoredData',
    'Queue',
    'Step',
    'Circle',
    'Diamond',
    'RealSquare',
    'Table',
  ];
  const g = new Graph(),
    root = new Node(1n, 500, 400);
  root.TopLeft = new Point(0, 0);
  root.isContainer = true;
  root.SetShape(shapes[f.trial % shapes.length]!);
  g.AddNewNodeToContainer(null, root);
  const a = new Node(2n, 40, 30),
    b = new Node(3n, 40, 30),
    ext = new Node(4n, 40, 30);
  a.TopLeft = new Point(40, 40);
  b.TopLeft = new Point(150, 40);
  ext.TopLeft = new Point(700, 40);
  g.AddNewNodeToContainer(root, a);
  g.AddNewNodeToContainer(root, b);
  g.AddNewNodeToContainer(null, ext);
  switch (f.trial % 4) {
    case 0:
      g.Connect(a, b);
      break;
    case 1:
      g.Connect(a, a);
      break;
    case 2:
      g.Connect(a, ext);
      break;
  }
  if (f.trial % 7 === 0) a.FixedTopLeft = a.TopLeft.Copy();
  if (f.trial % 11 === 0) root.FixedTopLeft = root.TopLeft.Copy();
  const candidates = Candidates(g);
  expect({
    ids: g.Nodes.filter((n) => candidates.has(n)).map((n) => Number(n.ID)),
    eligible: isEligibleContainer(g, root),
    shape: shapeCanBeContainer(root),
    structural: countHierarchyStructuralEdges(a),
  }).toEqual({
    ids: f.ids,
    eligible: f.eligible,
    shape: f.shape,
    structural: f.structural,
  });
});
