import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovghierarchy.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Hierarchy } from '../src/upstream/layoutgraph/records.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { newOVGForHierarchy } from '../src/upstream/routing/ovg-hierarchy.js';
it.each(fixtures)(
  'matches Go hierarchy visibility graph $trial $limit',
  (f) => {
    const trial = f.trial,
      g = new Graph(),
      node = g.AddNode(new Node(1n, 80, 60));
    node.SetShape(f.shape);
    node.TopLeft = new Point((trial % 7) * 20 - 40, (trial % 5) * 20 - 40);
    const h = new Hierarchy();
    h.Levels().set(node, 0);
    node.Hierarchy = h;
    g.Directions.set(null, 4 + (Math.trunc(trial / 4) % 4));
    const guard = new OVGBuildGuard(Background, {
      ...defaultOVGBuildLimits(),
      work: BigInt(f.limit),
    });
    let points: { x: number; y: number }[] | null = null,
      error = '';
    try {
      points = newOVGForHierarchy(g, h, guard).Nodes.map((n) => ({
        x: n.X,
        y: n.Y,
      }));
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error).toBe(f.error);
    expect(guard.work).toBe(BigInt(f.work));
    expect(guard.nodes).toBe(BigInt(f.count));
    expect(guard.candidates).toBe(BigInt(f.candidates));
    expect(points).toEqual(f.points);
    expect({ x: node.TopLeft!.X, y: node.TopLeft!.Y }).toEqual(f.position);
    expect(node.Width).toBe(f.width);
    expect(node.Height).toBe(f.height);
  },
);
