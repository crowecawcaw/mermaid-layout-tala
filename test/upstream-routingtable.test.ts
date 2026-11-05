import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingtable.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { SetNumColumns } from '../src/upstream/nodeshape/shape_table.js';
import { PositionArrowheadLabel } from '../src/upstream/labeling/arrowhead.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { addPorts } from '../src/upstream/routing/ovg-ports.js';
import { tablePorts } from '../src/upstream/routing/table-ports.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)('matches Go table ports and arrowhead labels $trial', (f) => {
  const trial = f.trial,
    g = new Graph(),
    a = g.AddNode(new Node(1n, 80, 60)),
    b = g.AddNode(new Node(2n, 90, 70));
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(
    ((trial % 3) - 1) * 150,
    ((Math.trunc(trial / 3) % 3) - 1) * 150,
  );
  if (trial % 2 === 0) {
    a.SetShape('Table');
    SetNumColumns(a.Shape, 1 + (trial % 4));
  }
  if (trial % 4 === 0) {
    b.SetShape('Table');
    SetNumColumns(b.Shape, 1 + (trial % 3));
  }
  const e = g.Connect(a, b);
  if (trial % 3 !== 0) e.FromTableColumnIndex = 0;
  if (trial % 5 !== 0) e.ToTableColumnIndex = 0;
  e.SourceArrowhead = 'triangle';
  e.TargetArrowhead = 'diamond';
  e.SourceArrowheadLabel = new Label();
  Object.assign(e.SourceArrowheadLabel, {
    Text: 'source',
    Width: 23.5,
    Height: 11.25,
  });
  e.TargetArrowheadLabel = new Label();
  Object.assign(e.TargetArrowheadLabel, {
    Text: 'target',
    Width: 31.5,
    Height: 13.75,
  });
  const ovg = new OVG(g.Nodes);
  addPorts(ovg, g, new OVGBuildGuard(Background, defaultOVGBuildLimits()));
  const guard = new RouteSearchWorkGuard(Background, 'Default', 10000n),
    [s, t] = tablePorts(ovg, e, a, b, trial % 2 === 0, guard);
  const indices = (ports: typeof s, node: Node) =>
      ports === null
        ? null
        : (ovg.Ports.get(node) ?? []).flatMap((p, i) =>
            ports.has(p) ? [i] : [],
          ),
    route = [
      new Point(80, 30),
      new Point(120, 30),
      new Point(120, 100),
      new Point(160, 100),
    ],
    la = PositionArrowheadLabel(e, false, route)!,
    lb = PositionArrowheadLabel(e, true, route)!;
  expect(indices(s, a)).toEqual(f.source);
  expect(indices(t, b)).toEqual(f.target);
  expect(guard.Used()).toBe(BigInt(f.work));
  compare({ x: la.Box.TopLeft.X, y: la.Box.TopLeft.Y }, f.aLabel);
  compare({ x: lb.Box.TopLeft.X, y: lb.Box.TopLeft.Y }, f.bLabel);
});
