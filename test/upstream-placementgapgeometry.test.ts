import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementgapgeometry.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  isBetween,
  nearestBetween,
  nearestConnectedAhead,
} from '../src/upstream/placement/gap-geometry.js';
it.each(fixtures)(
  'matches Go gap geometry $trial $horizontal $forward',
  (f) => {
    const g = new Graph(),
      nodes: Node[] = [];
    for (let i = 0; i < 8; i++) {
      const n = g.AddNode(
        new Node(BigInt(i + 1), 30 + (i % 3) * 10, 25 + (i % 2) * 15),
      );
      n.TopLeft = new Point(
        ((i * 73 + f.trial * 19) % 410) - 50,
        ((i * 41 + f.trial * 13) % 250) - 60,
      );
      nodes.push(n);
    }
    g.Containers.set(null, nodes);
    for (let i = 1; i < nodes.length; i++)
      if ((i + f.trial) % 3 !== 0) g.Connect(nodes[0]!, nodes[i]!);
    const id = (n: Node | null) => (n ? Number(n.ID) : 0);
    expect(
      nodes.map((n) =>
        isBetween(n, nodes[0]!, nodes[1]!, f.horizontal, f.forward),
      ),
    ).toEqual(f.between);
    expect(
      id(
        nearestBetween(
          nodes,
          nodes[0]!,
          nodes[1]!,
          null,
          f.horizontal,
          f.forward,
        ),
      ),
    ).toBe(f.nearest);
    expect(id(nearestConnectedAhead(nodes[0]!, f.horizontal, f.forward))).toBe(
      f.connected,
    );
  },
);
