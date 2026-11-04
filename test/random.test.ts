import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-random.json';
import { GoRandom, normalizeSeeds } from '../src/random.js';

describe('Go-compatible deterministic random stream', () => {
  it.each(fixtures)('matches Go math/rand across state wraparound for seed $seed', (fixture) => {
    const rng = new GoRandom(BigInt(fixture.seed));
    expect(fixture.int63.map(() => rng.int63().toString())).toEqual(fixture.int63);
    expect(fixture.float64.map(() => rng.float64())).toEqual(fixture.float64);
    expect(fixture.intn.map(() => rng.intn(1001))).toEqual(fixture.intn);
    const values = Array.from({ length: 100 }, (_, i) => i);
    rng.shuffle(values);
    expect(values).toEqual(fixture.shuffle);
  });
  it('uses upstream defaults and deduplicates in authored order', () => {
    expect(normalizeSeeds()).toEqual([1n, 2n, 3n]);
    expect(normalizeSeeds([3, 1, 3n, 2])).toEqual([3n, 1n, 2n]);
    expect(normalizeSeeds(Array(64).fill(1))).toEqual([1n]);
  });
  it('enforces upstream entry/unique limits and exact integer representation', () => {
    for (const seeds of [
      [],
      Array(65).fill(1),
      Array.from({ length: 17 }, (_, i) => i),
      [NaN],
      [1.5],
      [2 ** 53],
      [9223372036854775808n],
      [-9223372036854775809n],
    ]) {
      expect(() => normalizeSeeds(seeds)).toThrow();
    }
    expect(normalizeSeeds([-9223372036854775808n, 9223372036854775807n])).toHaveLength(2);
  });
});
