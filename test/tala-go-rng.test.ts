import { describe, expect, it } from 'vitest';
import { GoRandom } from '../src/tala/go-rng.js';

describe('Go math/rand compatibility', () => {
  it('matches Go Source seed 1 Int63 stream', () => {
    const random = new GoRandom(1);
    expect(Array.from({ length: 5 }, () => random.int63())).toEqual([
      5577006791947779410n, 8674665223082153551n, 6129484611666145821n,
      4037200794235010051n, 3916589616287113937n,
    ]);
  });

  it('preserves seed normalization, float conversion, and shuffle', () => {
    expect(new GoRandom(0).int63()).toBe(new GoRandom(2147483647).int63());
    expect(new GoRandom(1).float64()).toBe(0.6046602879796196);
    const list = Array.from({ length: 10 }, (_, index) => index);
    new GoRandom(1).shuffle(list);
    expect(list).toEqual([1, 7, 4, 0, 9, 2, 3, 5, 8, 6]);
  });
});
