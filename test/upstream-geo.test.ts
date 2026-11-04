import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-geo.json';
import { Point, GetMedian } from '../src/upstream/geo/point.js';
import { Segment } from '../src/upstream/geo/segment.js';
import { Box } from '../src/upstream/geo/box.js';
import { Ellipse } from '../src/upstream/geo/ellipse.js';
import { BezierCurve } from '../src/upstream/geo/bezier.js';
import { Route } from '../src/upstream/geo/route.js';
import { GetUnitNormalVector } from '../src/upstream/geo/vector.js';
import { IntersectionPoint } from '../src/upstream/geo/point.js';
function json(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, v) =>
      typeof v === 'number' && !Number.isFinite(v)
        ? Number.isNaN(v)
          ? 'NaN'
          : v > 0
            ? '+Inf'
            : '-Inf'
        : v,
    ),
  );
}
function compare(actual: unknown, expected: unknown, path = 'result'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(
      1e-10 * Math.max(1, Math.abs(expected)),
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) =>
      compare((actual as unknown[])[i], v, `${path}[${i}]`),
    );
  } else if (expected !== null && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [key, v] of Object.entries(expected))
      compare((actual as Record<string, unknown>)[key], v, `${path}.${key}`);
  } else expect(actual, path).toBe(expected);
}
describe('direct translation of upstream lib/geo', () => {
  it.each(fixtures)('matches Go $name', (f) => {
    const points = f.points.map((p) => new Point(p.x, p.y)),
      [a, b, c, d, e, last] = points as [
        Point,
        Point,
        Point,
        Point,
        Point,
        Point,
      ];
    const s = new Segment(a, b),
      other = new Segment(c, d),
      box = new Box(e, f.width, f.height),
      ellipse = new Ellipse(last, f.width / 2, f.height / 2),
      curve = new BezierCurve(points.slice(0, 4)),
      route = new Route(points);
    const [at, index] = route.GetPointAtDistance(f.distance),
      vector = a.VectorTo(b),
      f32 = a.Copy(),
      trunc = a.Copy();
    f32.TruncateFloat32();
    trunc.TruncateDecimals();
    compare(
      json({
        orientation: a.GetOrientation(b),
        compare: a.Compare(b),
        distance: a.DistanceToLine(c, d),
        onSegment: a.OnOrthogonalSegment(c, d),
        intersection: IntersectionPoint(a, b, c, d),
        median: GetMedian(points),
        vector: vector.components,
        unit: vector.Unit().components,
        radians: vector.Radians(),
        degrees: vector.Degrees(),
        addLength: vector.AddLength(7.5).components,
        normal: GetUnitNormalVector(a.X, a.Y, b.X, b.Y),
        float32: f32,
        truncate: trunc,
        segmentOverlaps: s.Overlaps(other, true, 3.5),
        segmentOverlapsVertical: s.Overlaps(other, false, 3.5),
        segmentBounds: s.GetBounds([other, new Segment(e, last)], 3.5),
        segmentLength: s.Length(),
        boxIntersects: box.Intersects(s, 3.5),
        boxIntersections: box.Intersections(s),
        boxContains: box.Contains(a),
        boxOverlaps: box.Overlaps(new Box(c, 15, 20)),
        ellipse: ellipse.Intersections(s),
        curveAt: curve.At(0.37),
        curveIntersections: curve.Intersections(new Segment(e, last)),
        routeLength: route.Length(),
        routeAt: at,
        routeIndex: index,
        routeBounds: route.GetBoundingBox(),
      }),
      f.expected,
    );
  });
});
