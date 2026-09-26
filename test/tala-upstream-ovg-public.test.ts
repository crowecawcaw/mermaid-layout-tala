import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeGraphEdges } from '../src/route.js';
import type { OVGFlatNode } from '../src/tala/ovg-build.js';

interface Case { name: string; nodes: OVGFlatNode[];
  edges: Array<{ id: string; from: string; to: string }> }
interface Output { name: string; selectedFlavor: string;
  finalRoutes: Array<{ id: string; points: [number, number][] }>;
  tracedRoutes: Array<{ id: string; points: [number, number][] }>;
  flavors: Array<{ name: string;
    routes: Array<{ id: string; segmentPoints: [number, number][] }> }> }
const read = (file: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8'));
const cases = read('ovg-sequential-cases.json') as Case[];
const expected = read('ovg-sequential-expected.json') as Output[];

describe('public flat router uses the selected Go OVG route flavor', () => {
  for (const input of cases) it(input.name, () => {
    const nodes = input.nodes.map((node) => ({ ...node,
      x: node.x + node.width / 2, y: node.y + node.height / 2,
      rank: 0, order: 0 }));
    const routes = routeGraphEdges(nodes, input.edges, 'TB', new Map(), true);
    const oracle = expected.find((item) => item.name === input.name)!;
    for (const route of oracle.tracedRoutes) {
      expect(routes.find((item) => item.id === route.id)!.points.map(({ x, y }) => [x, y]))
        .toEqual(route.points);
    }
  });
});
