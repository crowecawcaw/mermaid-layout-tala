import { describe, expect, it } from 'vitest';
import { countNonSharedCrossings } from '../src/tala/crossings.js';
import type { PositionedEdge } from '../src/layout.js';

function edge(id: string, points: Array<{ x: number; y: number }>): PositionedEdge {
  return { id, from: id + 'a', to: id + 'b', points, x: 0, y: 0 };
}

describe('upstream TALA crossing score', () => {
  it('counts an interior right-angle crossing', () => {
    expect(countNonSharedCrossings([
      edge('horizontal', [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      edge('vertical', [{ x: 5, y: -5 }, { x: 5, y: 5 }]),
    ])).toBe(1);
  });

  it('does not count parallel overlaps or a shared endpoint', () => {
    expect(countNonSharedCrossings([
      edge('a', [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      edge('b', [{ x: 5, y: 0 }, { x: 15, y: 0 }]),
      edge('c', [{ x: 10, y: 0 }, { x: 10, y: 10 }]),
    ])).toBe(0);
  });
});
