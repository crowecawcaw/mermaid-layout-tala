import { describe, expect, it } from 'vitest';
import {
  Background,
  Canceled,
  WithCancel,
  type Context,
} from '../src/upstream/limits/context.js';
import { WorkGuard } from '../src/upstream/limits/work.js';
import {
  OptimizationWorkGuard,
  ErrOptimizationResourceLimit,
  Shuffle,
} from '../src/upstream/limits/optimization.js';
import {
  CheckedAddUint64,
  CheckedMulUint64,
  MaxUint64,
} from '../src/upstream/limits/arithmetic.js';
import { GoRandom } from '../src/random.js';
// Translated contracts from upstream internal/limits/{work,optimization}_test.go.
const contexts = [
  { name: 'standard context', stride: 1024n, create: WithCancel },
  {
    name: 'nil Done context',
    stride: 64n,
    create: (): [Context, () => void] => {
      let canceled = false;
      return [
        { Done: () => null, Err: () => (canceled ? Canceled : null) },
        () => {
          canceled = true;
        },
      ];
    },
  },
];
describe('upstream work accounting', () => {
  it('retains rejected units, exact limits, and constructor cancellation', () => {
    const g = new WorkGuard(Background, 'test', 2n);
    g.Step();
    g.Step();
    expect(() => g.Step()).toThrow('TALA test work exceeds limit 2');
    expect(g.Used()).toBe(3n);
    expect(() => new WorkGuard(Background, 'negative test', -1n)).toThrow(
      'work limit must not be negative',
    );
    expect(() => new WorkGuard(Background, 'zero test', 0n).Step()).toThrow(
      'work exceeds limit 0',
    );
    const [ctx, cancel] = WithCancel();
    cancel();
    expect(() => new WorkGuard(ctx, 'canceled test', 2n)).toThrow(
      expect.objectContaining({ cause: Canceled }),
    );
  });
  for (const c of contexts) {
    for (const overflow of [false, true])
      it(`${c.name}: crossed stride, overflow=${overflow}`, () => {
        const [ctx, cancel] = c.create(),
          g = new WorkGuard(
            ctx,
            'crossed stride',
            c.stride + (overflow ? 0n : 1n),
          );
        g.Step();
        cancel();
        expect(() => g.Add(c.stride)).toThrow(
          expect.objectContaining({ cause: Canceled }),
        );
        expect(g.Used()).toBe(c.stride + 1n);
      });
    for (const [name, initial, charge, initialOverflow] of [
      ['no accepted boundary', 1n, c.stride - 1n, false],
      ['already at limit', c.stride - 1n, 1n, false],
      ['already over limit', c.stride, 0n, true],
      ['huge charge', 1n, 9223372036854775807n, false],
    ] as const) {
      it(`${c.name}: overflow precedes cancellation: ${name}`, () => {
        const [ctx, cancel] = c.create(),
          g = new WorkGuard(ctx, 'overflow ordering', c.stride - 1n);
        if (initialOverflow) expect(() => g.Add(initial)).toThrow();
        else g.Add(initial);
        cancel();
        expect(() => g.Add(charge)).toThrow(
          'TALA overflow ordering work exceeds limit',
        );
        expect(g.Used()).toBe(c.stride);
      });
    }
    for (const steps of [0, 1])
      it(`${c.name}: zero charge boundary at ${steps}`, () => {
        const [ctx, cancel] = c.create(),
          g = new WorkGuard(ctx, 'zero charge', 10000n);
        if (steps) g.Step();
        cancel();
        if (!steps)
          expect(() => g.Add(0n)).toThrow(
            expect.objectContaining({ cause: Canceled }),
          );
        else g.Add(0n);
        expect(g.Used()).toBe(BigInt(steps));
      });
  }
  it('preserves checked uint64 arithmetic', () => {
    expect(CheckedAddUint64(40n, 2n)).toEqual([42n, true]);
    expect(CheckedAddUint64(MaxUint64, 1n)).toEqual([0n, false]);
    expect(CheckedMulUint64(21n, 2n)).toEqual([42n, true]);
    expect(CheckedMulUint64(MaxUint64, 2n)).toEqual([0n, false]);
  });
  it('optimization overflow preserves accepted work and classified cause', () => {
    const g = new OptimizationWorkGuard(Background, 'test', MaxUint64);
    g.Add(MaxUint64);
    expect(() => g.Step()).toThrow(
      expect.objectContaining({ cause: ErrOptimizationResourceLimit }),
    );
    expect(g.Used()).toBe(MaxUint64);
    const p = new OptimizationWorkGuard(Background, 'test', MaxUint64);
    expect(() => p.AddProduct(MaxUint64, 2n)).toThrow(
      expect.objectContaining({ cause: ErrOptimizationResourceLimit }),
    );
    expect(p.Used()).toBe(0n);
    const z = new OptimizationWorkGuard(Background, 'zero', 0n);
    expect(() => z.Step()).toThrow(
      expect.objectContaining({ cause: ErrOptimizationResourceLimit }),
    );
    expect(z.Used()).toBe(0n);
  });
  it('optimization steps preserve the cancellation boundary and limit order', () => {
    const [ctx, cancel] = WithCancel();
    const g = new OptimizationWorkGuard(ctx, 'steps', 64n);
    for (let i = 0; i < 63; i++) g.Step();
    cancel();
    expect(() => g.Step()).toThrow(expect.objectContaining({ cause: Canceled }));
    expect(g.Used()).toBe(64n);
    const [limitedCtx, cancelLimited] = WithCancel();
    const limited = new OptimizationWorkGuard(limitedCtx, 'steps', 63n);
    for (let i = 0; i < 63; i++) limited.Step();
    cancelLimited();
    expect(() => limited.Step()).toThrow(expect.objectContaining({ cause: ErrOptimizationResourceLimit }));
    expect(limited.Used()).toBe(63n);
  });
  it.each([0, 1, 2, 3, 10, 127, 1024])(
    'guarded shuffle preserves values and random draw order for %i entries',
    (count) => {
      const expected = Array.from({ length: count }, (_, i) => i),
        actual = expected.slice(),
        a = new GoRandom(991n),
        b = new GoRandom(991n);
      a.shuffle(expected);
      Shuffle(
        actual,
        b,
        new OptimizationWorkGuard(Background, 'test', 250000000n),
      );
      expect(actual).toEqual(expected);
      expect(b.int63()).toBe(a.int63());
    },
  );
  it('checks cancellation before drawing random state when the work boundary is crossed', () => {
    const [ctx, cancel] = WithCancel(),
      g = new OptimizationWorkGuard(ctx, 'shuffle', 1000n);
    g.Add(63n);
    cancel();
    const random = new GoRandom(1n),
      untouched = new GoRandom(1n);
    expect(() => Shuffle([1, 2], random, g)).toThrow(
      expect.objectContaining({ cause: Canceled }),
    );
    expect(random.int63()).toBe(untouched.int63());
  });
});
