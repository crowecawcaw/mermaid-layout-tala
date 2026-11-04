import { afterEach, describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';
import { evaluateLayout, compareScores } from '../src/quality.js';
import { getTalaSeeds, setTalaSeeds } from '../src/random.js';

const nodes = Array.from({ length: 8 }, (_, i) => ({
  id: String(i),
  width: 50 + i * 7,
  height: 30 + i * 3,
}));
const edges = [
  [0, 3],
  [1, 3],
  [2, 4],
  [3, 5],
  [3, 6],
  [4, 6],
  [5, 7],
  [6, 7],
  [0, 7],
].map(([a, b], i) => ({ id: String(i), from: String(a), to: String(b) }));
afterEach(() => setTalaSeeds([1, 2, 3]));
describe('seed coordination', () => {
  it('chooses the least penalty and area, preferring the later exact tie', () => {
    const candidates = [1, 2, 3, 42].map((seed) =>
      layoutFlowchart(nodes, edges, { seeds: [seed] })
    );
    const expected = candidates.reduce((best, candidate) =>
      compareScores(evaluateLayout(candidate), evaluateLayout(best)) <= 0 ? candidate : best
    );
    const combined = layoutFlowchart(nodes, edges, { seeds: [1, 2, 3, 42] });
    expect(combined).toEqual(expected);
    expect(
      layoutFlowchart([...nodes].reverse(), [...edges].reverse(), { seeds: [1, 2, 3, 42] })
    ).toEqual(combined);
  });
  it('copies defaults and supports the complete signed 64-bit seed range', () => {
    const seeds = [42];
    setTalaSeeds(seeds);
    seeds[0] = 1;
    const returned = getTalaSeeds();
    returned[0] = 1n;
    expect(getTalaSeeds()).toEqual([42n]);
    expect(layoutFlowchart(nodes, edges)).toEqual(layoutFlowchart(nodes, edges, { seeds: [42] }));
    expect(
      layoutFlowchart(nodes, edges, { seeds: [-9223372036854775808n, 9223372036854775807n] }).nodes
    ).toHaveLength(8);
  });
  it('rejects invalid seeds before changing configured defaults', () => {
    expect(() => setTalaSeeds([])).toThrow();
    expect(getTalaSeeds()).toEqual([1n, 2n, 3n]);
    expect(() => layoutFlowchart([], [], { seeds: [] })).toThrow();
  });
});
