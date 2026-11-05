import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsentinel.json';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { OVGEdge } from '../src/upstream/routing/ovg-edge.js';
import { routeInSShape } from '../src/upstream/routing/sentinel-routes.js';
it.each(fixtures)('matches Go sentinel route traversal $trial', (f) => {
  const trial = f.trial,
    o = 4 + (trial % 4),
    points = [
      [0, 0],
      [0, 15],
      [0, 30],
      [20, 30],
      [40, 30],
      [40, 45],
      [40, 60],
    ].map(([x, y]) => {
      const p = new Point(x!, y!);
      switch (o) {
        case O.Bottom:
          p.Y = -p.Y;
          break;
        case O.Left:
          [p.X, p.Y] = [p.Y, p.X];
          break;
        case O.Right:
          [p.X, p.Y] = [-p.Y, p.X];
          break;
      }
      return p;
    }),
    nodes = points.map((p, i) => {
      const n = new OVGNode(p);
      n.Index = i;
      return n;
    });
  for (let i = 0; i < nodes.length - 1; i++)
    if (trial % 5 !== 0 || i !== Math.trunc(trial / 5) % 6) {
      const e = new OVGEdge(nodes[i]!, nodes[i + 1]!);
      nodes[i]!.addEdge(e);
      nodes[i + 1]!.addEdge(e);
    }
  let ids: number[] | null = null,
    error = '';
  try {
    ids = routeInSShape({
      SourcePortNode: nodes[0]!,
      TargetPortNode: nodes[6]!,
      SourceMidpoint: nodes[2]!.Point,
      TargetMidpoint: nodes[4]!.Point,
      SourceOrientationToTarget: o,
    }).map((n) => n.Index);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(ids).toEqual(f.ids);
});
