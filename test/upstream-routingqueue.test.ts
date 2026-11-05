import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingqueue.json';
import { PriorityQueue } from '../src/upstream/routing/priority-queue.js';
it.each(fixtures)('matches Go indexed routing queue $trial', (f) => {
  const q = new PriorityQueue<number>(),
    guard = {
      used: 0n,
      Add(n: bigint) {
        this.used += n;
      },
    },
    entries = [];
  for (let i = 0; i < 40 + (f.trial % 30); i++)
    entries.push(q.push((i * 7 + f.trial * 11) % 19, i, i % 2 === 0, guard));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if ((i + f.trial) % 4 === 0)
      q.decrease(e, e.priority - (1 + (i % 7)), guard);
  }
  const popped = [];
  while (!q.empty()) {
    const e = q.pop(guard);
    popped.push({
      node: e.node,
      priority: e.priority,
      horizontal: e.isHorizontal,
      index: e.index,
    });
  }
  expect(popped).toEqual(f.popped);
  expect(guard.used).toBe(BigInt(f.used));
});
it('rejects stale entries and reuses entries after reset', () => {
  const q = new PriorityQueue<number>(),
    old = q.push(1, 1, false, null);
  q.pop(null);
  q.push(2, 2, false, null);
  expect(() => q.decrease(old, 0, null)).toThrow(
    'entry is not in the priority queue',
  );
  q.reset();
  expect(q.push(3, 3, true, null)).toBe(old);
});
