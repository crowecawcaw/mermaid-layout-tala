import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-gosort.json';
import { Slice } from '../src/upstream/gosort/slice.js';
it.each(fixtures)(
  'matches Go unstable sort permutation and comparison count $name',
  (f) => {
    const order = f.values.map((_, j) => j);
    let comparisons = 0;
    Slice(order, (a, b) => {
      comparisons++;
      return f.values[a]! < f.values[b]!;
    });
    expect(order).toEqual(f.order);
    expect(comparisons).toBe(f.comparisons);
  },
);
