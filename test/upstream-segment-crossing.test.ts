import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import {
  CountSegmentCrossings,
  CountSegmentCrossingsContext,
} from '../src/upstream/layoutgraph/segment-crossing.js';

it('preserves upstream endpoint and parallel intersection rules', () => {
  const segment = (x1: number, y1: number, x2: number, y2: number) => ({
    Start: new Point(x1, y1),
    End: new Point(x2, y2),
  });
  const diagonal = segment(0, 0, 2, 2);
  expect(CountSegmentCrossings([diagonal, segment(0, 2, 2, 0)])).toBe(1);
  expect(CountSegmentCrossings([diagonal, segment(0, 0, 2, 0)])).toBe(0);
  expect(CountSegmentCrossings([diagonal, segment(0, 2, 2, 2)])).toBe(0);
  expect(CountSegmentCrossings([diagonal, segment(2, 2, 4, 0)])).toBe(1);
  expect(
    CountSegmentCrossings([segment(0, 0, 2, 0), segment(1, 0, 3, 0)]),
  ).toBe(0);
  expect(CountSegmentCrossingsContext(Background, [diagonal])).toBe(0);
  const [ctx, cancel] = WithCancel();
  cancel();
  expect(() => CountSegmentCrossingsContext(ctx, [diagonal])).toThrow(
    'EdgeLength: context canceled',
  );
});
