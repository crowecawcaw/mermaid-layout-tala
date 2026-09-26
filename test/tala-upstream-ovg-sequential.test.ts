import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateBestFlatOVGRoutes, generateFlatOVGRoutes, searchFlatOVGSequential,
  type OVGRouteFlavor, type OVGSequentialEdge } from '../src/tala/ovg-search.js';
import type { OVGFlatNode } from '../src/tala/ovg-build.js';

interface Case { name: string; nodes: OVGFlatNode[]; edges: OVGSequentialEdge[] }
interface Route { id: string; cost: number; points: [number, number][];
  segmentPoints?: [number, number][]; error?: string }
interface Flavor { name: OVGRouteFlavor; routes: Route[]; totalCost: number; error?: string }
interface Output { name: string; routes: Route[]; generated: Route[]; totalCost: number;
  flavors: Flavor[]; selectedFlavor: OVGRouteFlavor }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-sequential-cases.json') as Case[];
const expected = read('ovg-sequential-expected.json') as Output[];

describe('pinned upstream sequential OVG search', () => {
  for (const input of cases) {
    it(`first route: ${input.name}`, () => {
      const actual = searchFlatOVGSequential(input.nodes, input.edges)[0]!;
      const oracle = expected.find((item) => item.name === input.name)!.routes[0]!;
      expect(actual.id).toBe(oracle.id);
      expect(actual.points.map(({ x, y }) => [x, y])).toEqual(oracle.points);
      expect(actual.cost).toBeCloseTo(oracle.cost, 7);
    });
    it(`second route: ${input.name}`, () => {
      const actual = searchFlatOVGSequential(input.nodes, input.edges)[1]!;
      const oracle = expected.find((item) => item.name === input.name)!.routes[1]!;
      expect(actual.id).toBe(oracle.id);
      expect(actual.points.map(({ x, y }) => [x, y])).toEqual(oracle.points);
      expect(actual.cost).toBeCloseTo(oracle.cost, 7);
    });
    if (input.edges.length > 2) it(`complete sequence: ${input.name}`, () => {
      const actual = searchFlatOVGSequential(input.nodes, input.edges);
      const oracle = expected.find((item) => item.name === input.name)!.routes;
      expect(actual.map((route) => route.id)).toEqual(oracle.map((route) => route.id));
      for (let i = 0; i < oracle.length; i++) {
        expect(actual[i]!.points.map(({ x, y }) => [x, y])).toEqual(oracle[i]!.points);
        expect(actual[i]!.cost).toBeCloseTo(oracle[i]!.cost, 7);
      }
    });
    it(`generated routes: ${input.name}`, () => {
      const actual = generateFlatOVGRoutes(input.nodes, input.edges);
      const oracle = expected.find((item) => item.name === input.name)!;
      expect(actual.map((route) => route.id)).toEqual(oracle.generated.map((route) => route.id));
      for (let i = 0; i < oracle.generated.length; i++) {
        expect(actual[i]!.points.map(({ x, y }) => [x, y]))
          .toEqual(oracle.generated[i]!.points);
        expect(actual[i]!.segmentPoints.map(({ x, y }) => [x, y]))
          .toEqual(oracle.generated[i]!.segmentPoints);
      }
      expect(actual.reduce((sum, route) => sum + route.cost, 0))
        .toBeCloseTo(oracle.totalCost, 7);
    });
    it(`all route flavors: ${input.name}`, () => {
      const oracle = expected.find((item) => item.name === input.name)!;
      for (const flavor of oracle.flavors) {
        expect(flavor.error).toBeUndefined();
        const actual = generateFlatOVGRoutes(input.nodes, input.edges, flavor.name);
        expect(actual.map((route) => route.id)).toEqual(flavor.routes.map((route) => route.id));
        for (let i = 0; i < actual.length; i++) {
          expect(actual[i]!.points.map(({ x, y }) => [x, y]))
            .toEqual(flavor.routes[i]!.points);
          expect(actual[i]!.segmentPoints.map(({ x, y }) => [x, y]))
            .toEqual(flavor.routes[i]!.segmentPoints);
        }
        expect(actual.reduce((sum, route) => sum + route.cost, 0))
          .toBeCloseTo(flavor.totalCost, 7);
      }
      const selected = generateBestFlatOVGRoutes(input.nodes, input.edges);
      expect(selected.flavor).toBe(oracle.selectedFlavor);
    });
  }
});
