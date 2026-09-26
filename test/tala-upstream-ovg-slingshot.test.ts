import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completeFlatOVG } from '../src/tala/ovg-finalize.js';
import { OVGRouteState } from '../src/tala/ovg-route-state.js';
import { slingshotFlatOVG } from '../src/tala/ovg-slingshot.js';
import type { OVGFlatEdge, OVGFlatNode } from '../src/tala/ovg-build.js';

interface Edge extends OVGFlatEdge { id: string }
interface Case { name: string; nodes: OVGFlatNode[]; edges: Edge[] }
interface Route { id: string; cost: number; points: [number, number][] }
interface Output { name: string; slingshots: Route[] }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-sequential-cases.json') as Case[];
const expected = read('ovg-sequential-expected.json') as Output[];

describe('pinned upstream OVG slingshot', () => {
  for (const input of cases) {
    it(input.name, () => {
      const graph = completeFlatOVG(input.nodes, input.edges);
      const state = new OVGRouteState<OVGFlatEdge>(graph);
      const oracle = expected.find((item) => item.name === input.name)!;
      for (const target of oracle.slingshots) {
        const edge = input.edges.find((item) => item.id === target.id)!;
        const actual = slingshotFlatOVG(graph, input.nodes, input.edges, state, edge);
        if (!target.points.length) {
          expect(actual).toBeUndefined();
          continue;
        }
        expect(actual?.points.map(({ x, y }) => [x, y])).toEqual(target.points);
        expect(actual!.cost).toBeCloseTo(target.cost, 7);
      }
    });
  }
});
