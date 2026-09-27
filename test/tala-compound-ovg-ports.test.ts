import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ovgPortGridIntersections, ovgPortGroups,
  type OVGCandidateNode } from '../src/tala/ovg-candidates.js';
import { buildFlatOVGVertices } from '../src/tala/ovg-build.js';
import { connectOVGSweepNodes } from '../src/tala/ovg-sweep.js';
import { addFlatOVGTunnels } from '../src/tala/ovg-tunnels.js';
import { completeFlatOVG } from '../src/tala/ovg-finalize.js';
import { generateFlatOVGRoutes, type OVGRouteFlavor } from '../src/tala/ovg-search.js';

interface Node extends OVGCandidateNode { id: string }
interface Case { name: string; nodes: Node[]; edges: Array<{ from: string; to: string }> }
interface Expected { name: string; ports: Array<[number, number]>;
  intersections: Array<[number, number]>; afterCorners: Array<[number, number]>;
  sweepEdges: Array<[number, number, number, number]>;
  tunnelEdges: Array<[number, number, number, number]>;
  afterTunnels: Array<[number, number]>;
  fullVertexCount: number; fullEdgeCount: number;
  routeFlavors: Array<{ name: OVGRouteFlavor; cost: number;
    routes: Array<{ index: number; points: Array<[number, number]> }> }> }
const read = (file: string) => JSON.parse(readFileSync(new URL(
  `../tools/upstream-fixtures/${file}`, import.meta.url), 'utf8'));
const cases = read('compound-ovg-port-cases.json') as Case[];
const expected = read('compound-ovg-port-expected.json') as Expected[];
const ordered = (points: Array<[number, number]>): Array<[number, number]> =>
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const orderedEdges = (edges: Array<{ from: { x: number; y: number };
  to: { x: number; y: number } }>): Array<[number, number, number, number]> =>
  edges.map((edge) => {
    const a: [number, number] = [edge.from.x, edge.from.y];
    const b: [number, number] = [edge.to.x, edge.to.y];
    return [...(a[0] < b[0] || a[0] === b[0] && a[1] <= b[1] ? a : b),
      ...(a[0] < b[0] || a[0] === b[0] && a[1] <= b[1] ? b : a)]
      as [number, number, number, number];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]
    || a[2] - b[2] || a[3] - b[3]);

describe('compound OVG ports and grid intersections against Go', () => {
  for (const input of cases) it(input.name, () => {
    const oracle = expected.find((item) => item.name === input.name)!;
    const ports = new Map<string, [number, number]>();
    for (const node of input.nodes) for (const group of ovgPortGroups(node)) {
      for (const point of group) ports.set(`${point.x},${point.y}`, [point.x, point.y]);
    }
    expect(ordered([...ports.values()])).toEqual(oracle.ports);
    expect(ordered(ovgPortGridIntersections(input.nodes)
      .map((point) => [point.x, point.y]))).toEqual(oracle.intersections);
    const vertices = buildFlatOVGVertices(input.nodes, input.edges);
    expect(ordered(vertices.map((point) => [point.x, point.y]))).toEqual(oracle.afterCorners);
    const edges = orderedEdges(connectOVGSweepNodes(input.nodes.map((node) => ({ ...node,
      container: node.isGroup === true })), vertices));
    expect(edges).toEqual(oracle.sweepEdges);
    expect(orderedEdges(addFlatOVGTunnels(input.nodes, input.edges, vertices)))
      .toEqual(oracle.tunnelEdges);
    expect(ordered(vertices.map((point) => [point.x, point.y])))
      .toEqual(oracle.afterTunnels);
    const routingEdges = input.edges.map((edge, index) => ({ ...edge, id: `E${index}` }));
    const full = completeFlatOVG(input.nodes, routingEdges);
    expect([full.vertices.length, full.edgeObjects.length])
      .toEqual([oracle.fullVertexCount, oracle.fullEdgeCount]);
    for (const flavor of oracle.routeFlavors) {
      const routes = generateFlatOVGRoutes(input.nodes, routingEdges, flavor.name);
      expect(routes.reduce((cost, route) => cost + route.cost, 0))
        .toBeCloseTo(flavor.cost, 7);
      expect(routes.map((route) => ({ index: Number(route.id.slice(1)),
        points: route.segmentPoints.map((point): [number, number] => [point.x, point.y]) })))
        .toEqual(flavor.routes);
    }
  });
});
