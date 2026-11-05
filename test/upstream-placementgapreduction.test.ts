import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementgapreduction.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { reduceGapToNeighbors } from '../src/upstream/placement/gap-reduction.js';
import {
  LayoutAxis,
  TraversalDirection,
} from '../src/upstream/placement/axis.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)(
  'matches Go gap reduction $trial $horizontal $forward',
  (f) => {
    const g = new Graph();
    g.CellSize = 50;
    const positions = [
      new Point(0, 0),
      new Point(220 + (f.trial % 7) * 25, 0),
      new Point(-260 - (f.trial % 5) * 20, 0),
      new Point(0, 200),
    ];
    const nodes = positions.map((p, i) => {
      const n = g.AddNode(new Node(BigInt(i + 1), 40, 30));
      n.TopLeft = p;
      if (!f.horizontal) {
        [p.X, p.Y] = [p.Y, p.X];
        [n.Width, n.Height] = [n.Height, n.Width];
      }
      return n;
    });
    g.Containers.set(null, nodes);
    g.Connect(nodes[0]!, nodes[1]!);
    g.Connect(nodes[0]!, nodes[2]!);
    if (f.trial % 2 === 0) g.Connect(nodes[0]!, nodes[3]!);
    if (f.trial % 9 === 0) nodes[1]!.FixedTopLeft = nodes[1]!.TopLeft!.Copy();
    let changed = false,
      length = 0,
      error = '';
    try {
      [changed, length] = reduceGapToNeighbors(Background, nodes[0]!, null, {
        axis: f.horizontal ? LayoutAxis.Horizontal : LayoutAxis.Vertical,
        direction: f.forward
          ? TraversalDirection.Forward
          : TraversalDirection.Backward,
        attemptRecoverSymmetry: f.trial % 3 === 0,
      });
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error).toBe(f.error);
    expect(changed).toBe(f.changed);
    expect(length).toBeCloseTo(f.length, 6);
    compare(
      nodes.map((n) => ({ x: n.TopLeft!.X, y: n.TopLeft!.Y })),
      f.points,
    );
  },
);
