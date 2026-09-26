import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { connectOVGSweepNodes, type OVGSweepObstacle,
  type OVGSweepVertex } from '../src/tala/ovg-sweep.js';

interface Case { name: string; obstacles: OVGSweepObstacle[]; vertices: OVGSweepVertex[] }
interface Output { name: string; edges: [number, number, number, number][] }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-sweep-cases.json') as Case[];
const expected = read('ovg-sweep-expected.json') as Output[];

describe('pinned upstream OVG visibility sweep', () => {
  for (const input of cases) {
    it(input.name, () => {
      const actual = connectOVGSweepNodes(input.obstacles, input.vertices).map(({ from, to }) => {
        const first = from.x < to.x || from.x === to.x && from.y < to.y ? from : to;
        const second = first === from ? to : from;
        return [first.x, first.y, second.x, second.y] as [number, number, number, number];
      }).sort((a, b) => {
        for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
        return 0;
      });
      expect(actual).toEqual(expected.find((item) => item.name === input.name)!.edges);
    });
  }
  const realGraphs = read('ovg-real-sweep-expected.json') as Array<Case & Output>;
  for (const input of realGraphs) {
    it(`full-build vertices: ${input.name}`, () => {
      const actual = connectOVGSweepNodes(input.obstacles, input.vertices).map(({ from, to }) => {
        const first = from.x < to.x || from.x === to.x && from.y < to.y ? from : to;
        const second = first === from ? to : from;
        return [first.x, first.y, second.x, second.y] as [number, number, number, number];
      }).sort((a, b) => {
        for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
        return 0;
      });
      expect(actual).toEqual(input.edges);
    });
  }
});
