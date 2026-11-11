import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-routingflavorworkers.json';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import { generateRouteFlavorResponsesWith } from '../src/upstream/routing/flavor-workers.js';
import type { RouteGenerationFlavor } from '../src/upstream/routing/sort-edges.js';

it.each(fixtures)('matches Go route worker coordination: $name', (fixture) => {
  const flavors: RouteGenerationFlavor[] = ['ShortestToLongest', 'LongestToShortest', 'Default'];
  if (fixture.name === 'too-many') flavors.push('Default');
  const routers = flavors.map((flavor) => ({ flavor }));
  let calls = 0;
  let message = '';
  let responses: { flavor: string; distance: number; error: string }[] = [];
  try {
    responses = generateRouteFlavorResponsesWith(Background, routers, true, (router) => {
      calls++;
      if (fixture.name === 'panic-all' || (fixture.name === 'panic-first' && router.flavor === 'ShortestToLongest'))
        throw { toString: () => { throw new Error('panic payload was formatted'); } };
      const failed = fixture.name === 'ordinary-error' && router.flavor === 'ShortestToLongest';
      return { Flavor: 'Default', Routes: null, Distance: failed ? 0 : 42,
        Err: failed ? new Error('ordinary failure') : null };
    }).map((response) => ({ flavor: response.Flavor, distance: response.Distance, error: response.Err?.message ?? '' }));
  } catch (error) {
    message = (error as Error).message;
  }
  expect({ error: message, calls, responses }).toEqual({ error: fixture.error, calls: fixture.calls, responses: fixture.responses });
});

it('prioritizes a worker panic over parent cancellation', () => {
  const [ctx, cancel] = WithCancel();
  expect(() => generateRouteFlavorResponsesWith(ctx, [{ flavor: 'Default' }], false, () => {
    cancel();
    throw new Error('private panic payload');
  })).toThrow('layout invariant violated: edge routing flavor Default violated an invariant');
});
