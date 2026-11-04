import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-label.json';
import * as label from '../src/upstream/label/label.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { Route } from '../src/upstream/geo/route.js';
describe('direct upstream label geometry translation', () => {
  it.each(fixtures)('matches every label position in Go $name', (f) => {
    const route = new Route(f.route.map((p) => new Point(p.x, p.y))),
      box = new Box(
        new Point(f.box.TopLeft.x, f.box.TopLeft.y),
        f.box.Width,
        f.box.Height,
      );
    for (const expected of f.expected) {
      const pos = expected.position,
        [point, index] = label.GetPointOnRoute(
          pos,
          route,
          f.stroke,
          f.percent,
          f.width,
          f.height,
        );
      const actual = {
        position: pos,
        string: label.String(pos),
        fromString: label.FromString(label.String(pos)),
        mirrored: label.Mirrored(pos),
        isShape: label.IsShapePosition(pos),
        isEdge: label.IsEdgePosition(pos),
        outside: label.IsOutside(pos),
        unlocked: label.IsUnlocked(pos),
        border: label.IsBorder(pos),
        onEdge: label.IsOnEdge(pos),
        box: label.GetPointOnBox(pos, box, 5, f.width, f.height),
        route: point,
        index,
      };
      expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
    }
  });
});
