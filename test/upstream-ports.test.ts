import { it } from 'vitest';
import fixtures from './fixtures/upstream-ports.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import {
  ports,
  centerPorts,
  portsByOrientation,
  pointToPortOrientation,
  facingTablePorts,
  isAxisAligned,
} from '../src/upstream/layoutgraph/ports.js';
import { distanceBetweenTableColumns } from '../src/upstream/placementcost/geometry.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)(
  'matches Go absolute ports, table alignment and column scoring $trial',
  (f) => {
    const g = new Graph();
    g.CellSize = 40;
    const a = g.AddNode(new Node(1n, f.width, f.height)),
      b = g.AddNode(new Node(2n, 90.75, 130.25));
    a.SetShape(f.shape);
    a.SetNumColumns(f.columns);
    a.TopLeft = new Point(-20.5, 30.25);
    b.SetShape('Table');
    b.SetNumColumns(4);
    b.TopLeft = new Point(f.other.x, f.other.y);
    const e = g.Connect(a, b);
    e.FromTableColumnIndex = f.fromColumn;
    e.ToTableColumnIndex = f.toColumn;
    const ps = ports(a),
      point = (p: Point) => ({ x: p.X, y: p.Y }),
      facing = facingTablePorts(e, a, b);
    compare(
      {
        ports: ps.map(point),
        centers: centerPorts(a).map(point),
        sides: [O.Top, O.Right, O.Left, O.Bottom].map((o) =>
          portsByOrientation(a, o).map(point),
        ),
        orientations: ps.map((p) => pointToPortOrientation(a, p)),
        facing: { ...facing, from: point(facing.from), to: point(facing.to) },
        aligned: isAxisAligned(e),
        distance: distanceBetweenTableColumns(g, e, a, b),
      },
      f.expected,
    );
  },
);
