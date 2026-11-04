import { Node } from '../src/upstream/layoutgraph/node.js';
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-shapegeometry.json';
import { NewShape } from '../src/upstream/shape/new-shape.js';
import {
  GetPathCommands,
  TraceToShapeBorder,
} from '../src/upstream/shape/base.js';
import { Box } from '../src/upstream/geo/box.js';
import { Point } from '../src/upstream/geo/point.js';
import { Segment } from '../src/upstream/geo/segment.js';
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
    for (const [key, value] of Object.entries(expected))
      compare(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`,
      );
  } else expect(actual, path).toBe(expected);
}
describe('direct upstream shape geometry translation', () => {
  it.each(fixtures)(
    'matches Go dimensions, paths, intersections and border tracing for $name',
    (f) => {
      const box = new Box(
          new Point(f.box.TopLeft.x, f.box.TopLeft.y),
          f.box.Width,
          f.box.Height,
        ),
        s = NewShape(f.type, box),
        padding = s.GetDefaultPadding(),
        fit = s.GetDimensionsToFit(f.width, f.height, ...padding),
        inner = s.GetInnerBox().Copy(),
        content = s.GetInnerBoxForContent(f.width, f.height),
        inside = s.GetInsidePlacement(f.width, f.height, ...padding);
      s.SetInnerBoxAspectRatio(f.aspect);
      const innerWithAspect = s.GetInnerBox().Copy();
      const intersections = f.segments.map(([a, b]) => {
        const segment = new Segment(
          new Point(a!.x, a!.y),
          new Point(b!.x, b!.y),
        );
        return s.Perimeter().flatMap((part) => part.Intersections(segment));
      });
      const border = new Point(box.TopLeft.X, box.TopLeft.Y + box.Height / 2),
        prev = new Point(border.X - 40, border.Y),
        trace = TraceToShapeBorder(s, border, prev);
      compare(
        JSON.parse(
          JSON.stringify({
            type: s.GetType(),
            square: s.AspectRatio1(),
            rectangular: s.IsRectangular(),
            inner,
            content,
            inside,
            padding,
            fit,
            innerWithAspect,
            paths: s.GetSVGPathData(),
            commands: GetPathCommands(s),
            intersections,
            trace,
          }),
        ),
        f.expected,
      );
    },
  );
});

it('shares node geometry with shape and port policies across mutations', () => {
  const node = new Node(1n, 100, 80);
  node.TopLeft = new Point(10, 20);
  node.SetShape('Diamond');
  expect(node.Shape.GetBox()).toBe(node.Box);
  node.Width = 200;
  node.Translate(5, 7);
  expect(node.Shape.GetBox().Width).toBe(200);
  expect(node.Shape.GetBox().TopLeft).toBe(node.TopLeft);
  expect(node.TopLeft).toEqual(new Point(15, 27));
  const shape = node.Shape;
  node.SetShape('unsupported');
  expect(node.Shape).toBe(shape);
  node.SetShape('Table');
  node.SetNumColumns(4);
  expect(node.NumColumns()).toBe(4);
  expect(node.Shape.GetBox()).toBe(node.Box);
});
