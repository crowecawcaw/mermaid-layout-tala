import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingsort.json';
import { Background } from '../src/upstream/limits/context.js';
import {
  RouteWorkGuard,
  stableSortRouteValues,
} from '../src/upstream/routing/stage-guard.js';
it.each(fixtures)('matches Go stable route sort $trial $limit', (f) => {
  const items = Array.from({ length: f.trial % 25 }, (_, index) => ({
      key: (index * 7 + f.trial * 3) % 9,
      index,
    })),
    guard = new RouteWorkGuard(Background, 'test', BigInt(f.limit));
  let error = '';
  try {
    stableSortRouteValues(items, (a, b) => a.key < b.key, guard);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(items).toEqual(f.items);
});
