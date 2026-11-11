import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutcontextpoll.json';
import { layoutGraph, routeEdges, type TalaContext } from '../src/core.js';

it.each(fixtures)('matches Go public $operation context polling after $limit checks', (fixture) => {
  let checks = 0;
  const context: TalaContext = { Done: () => null, Err: () => ++checks > fixture.limit ? new Error('context canceled') : null };
  let error = '';
  try {
    if (fixture.operation === 'layout')
      layoutGraph([{ id: 'a', width: 40, height: 30 }, { id: 'b', width: 40, height: 30 }],
        [{ id: 'e', from: 'a', to: 'b' }], { direction: 'TB', seeds: [1n], context });
    else
      routeEdges([{ id: 'a', x: 20, y: 15, width: 40, height: 30 }, { id: 'b', x: 220, y: 15, width: 40, height: 30 }],
        [{ id: 'e', from: 'a', to: 'b' }], ['e'], { direction: 'TB', context });
  } catch (caught) { error = (caught as Error).message; }
  expect({ error, checks }).toEqual({ error: fixture.error, checks: fixture.checks });
});
