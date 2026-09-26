import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ovgCandidatePoints, ovgPortGridIntersections,
  type OVGCandidateNode } from '../src/tala/ovg-candidates.js';
import type { Point } from '../src/layout.js';

interface Case { name: string; nodes: Array<OVGCandidateNode & { id: string }> }
interface Output { name: string; ports: Record<string, Point[]>;
  perimeter: Point[]; halfway: Point[]; intersections: Point[] }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-candidate-cases.json') as Case[];
const expected = read('ovg-candidate-expected.json') as Output[];

describe('pinned upstream OVG candidate geometry', () => {
  it('rejects an oversized port grid before scanning its Cartesian product', () => {
    const nodes = Array.from({ length: 600 }, (_, index) => ({
      x: index * 100, y: index * 100, width: 40, height: 30,
    }));
    expect(() => ovgPortGridIntersections(nodes))
      .toThrow(/intersection candidate count .* exceeds limit 1000000/);
  });
  for (const input of cases) {
    it(input.name, () => {
      const result = ovgCandidatePoints(input.nodes[0]!, input.nodes[1]!);
      const target = expected.find((item) => item.name === input.name)!;
      expect(result.ports[0]).toEqual(target.ports[input.nodes[0]!.id]);
      expect(result.ports[1]).toEqual(target.ports[input.nodes[1]!.id]);
      expect(result.perimeter).toEqual(target.perimeter);
      expect(result.halfway).toEqual(target.halfway);
      if (input.nodes.length === 2) expect(result.intersections).toEqual(target.intersections);
      expect(ovgPortGridIntersections(input.nodes)).toEqual(target.intersections);
    });
  }
});
