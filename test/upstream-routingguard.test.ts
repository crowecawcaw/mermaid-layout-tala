import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingguard.json';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import {
  RouteSearchWorkGuard,
  SearchTelemetry,
} from '../src/upstream/routing/search-guard.js';
it.each(fixtures)('matches Go route search budget $trial $limit', (f) => {
  const telemetry = new SearchTelemetry(),
    g = new RouteSearchWorkGuard(
      Background,
      'Default',
      BigInt(f.limit),
      null,
      telemetry,
    ),
    errors = [];
  for (let i = 0; i < 20; i++) {
    let error = '';
    try {
      switch ((i + f.trial) % 4) {
        case 0:
          g.Step();
          break;
        case 1:
          g.Add(BigInt((i + f.trial) % 10));
          break;
        case 2:
          g.ReserveSort((i + f.trial) % 12);
          break;
        case 3:
          g.ReserveProduct(BigInt((i + f.trial) % 5), BigInt(i % 4));
          break;
      }
    } catch (e) {
      error = (e as Error).message;
    }
    errors.push(error);
  }
  g.Finish();
  expect(errors).toEqual(f.errors);
  expect(g.Used()).toBe(BigInt(f.used));
  expect(telemetry.WorkSamples()).toEqual([BigInt(f.used)]);
});
it('checks cancellation and uint64 arithmetic overflow', () => {
  const [ctx, cancel] = WithCancel(),
    g = new RouteSearchWorkGuard(ctx, 'Default', 100n);
  expect(() => g.ReserveSum((1n << 64n) - 1n, 1n)).toThrow(
    'arithmetic overflow',
  );
  cancel();
  expect(() => g.Finish()).toThrow('EdgeRouting: context canceled');
});
