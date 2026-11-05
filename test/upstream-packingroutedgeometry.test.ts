import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingroutedgeometry.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import { newWorkGuard } from '../src/upstream/packing/guard.js';
import {
  routedContainerPointSides,
  routedContainerEndpointKeepsSides,
  routedContainerBoxCovers,
  routedContainerControlHullIsPreserved,
  routedContainerSegmentBoxInterval,
  routedContainerSegmentStaysInsideShrink,
} from '../src/upstream/packing/routed-container-geometry.js';
it.each(fixtures)('matches Go packing routed geometry $trial', (f) => {
  const trial = f.trial,
    original = new Box(new Point(0, 0), 200, 160),
    proposed = new Box(
      new Point((trial % 3) * 10, (trial % 5) * 5),
      200 - (trial % 4) * 10,
      160 - (trial % 6) * 5,
    );
  let a = new Point(((trial * 47) % 300) - 50, ((trial * 29) % 240) - 40);
  const b = new Point(
    ((trial * 83 + 5) % 300) - 50,
    ((trial * 53 + 7) % 240) - 40,
  );
  if (trial % 4 === 0) a = new Point((trial % 21) * 10, 0);
  expect(routedContainerPointSides(original, a)).toBe(f.sides);
  expect(routedContainerEndpointKeepsSides(original, proposed, a)).toBe(
    f.keeps,
  );
  expect(routedContainerBoxCovers(original, proposed)).toBe(f.covers);
  expect(routedContainerControlHullIsPreserved(original, proposed, a, b)).toBe(
    f.hull,
  );
  let guard = newWorkGuard(Background, 1000000n);
  const [enter, exit, intersects, valid] = routedContainerSegmentBoxInterval(
    original,
    a,
    b,
    guard,
  );
  expect(enter).toBeCloseTo(f.enter, 12);
  expect(exit).toBeCloseTo(f.exit, 12);
  expect([intersects, valid, Number(guard.Used())]).toEqual([
    f.intersects,
    f.valid,
    f.intervalWork,
  ]);
  guard = newWorkGuard(Background, 1000000n);
  expect(
    routedContainerSegmentStaysInsideShrink(original, proposed, a, b, guard),
  ).toBe(f.stays);
  expect(Number(guard.Used())).toBe(f.stayWork);
});
