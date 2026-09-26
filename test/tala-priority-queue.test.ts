import { describe, expect, it } from 'vitest';
import { TalaPriorityQueue } from '../src/tala/priority-queue.js';

describe('TALA route search priority queue', () => {
  it('preserves insertion order for equal route costs, including decreased entries', () => {
    const queue = new TalaPriorityQueue<string>();
    queue.push(10, 'vertical source', false);
    const late = queue.push(50, 'later horizontal', true);
    queue.push(10, 'horizontal source', true);
    queue.decrease(late, 10);
    expect([queue.pop().node, queue.pop().node, queue.pop().node]).toEqual([
      'vertical source', 'later horizontal', 'horizontal source',
    ]);
    expect(queue.empty()).toBe(true);
  });

  it('updates a queued state in place and rejects stale handles', () => {
    const queue = new TalaPriorityQueue<string>();
    queue.push(30, 'a', false);
    const b = queue.push(20, 'b', true);
    queue.push(40, 'c', false);
    queue.decrease(b, 5);
    expect(queue.pop().node).toBe('b');
    expect(() => queue.decrease(b, 1)).toThrow('entry is not in the priority queue');
    expect([queue.pop().node, queue.pop().node]).toEqual(['a', 'c']);
    expect(() => queue.pop()).toThrow('empty priority queue');
  });

  it('invalidates queued handles on reset', () => {
    const queue = new TalaPriorityQueue<string>();
    const old = queue.push(1, 'old', false);
    queue.reset();
    queue.push(1, 'new', true);
    expect(() => queue.decrease(old, 0)).toThrow('entry is not in the priority queue');
    expect(queue.pop().node).toBe('new');
  });
});
