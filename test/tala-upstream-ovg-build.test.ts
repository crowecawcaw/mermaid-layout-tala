import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFlatOVG, buildFlatOVGVertices, type OVGFlatNode } from '../src/tala/ovg-build.js';
import type { OVGSweepVertex } from '../src/tala/ovg-sweep.js';

interface Case { name: string; nodes: OVGFlatNode[] }
interface Output { name: string; vertices: OVGSweepVertex[]; preTunnelCount: number;
  tunnelEdges: [number, number, number, number][];
  edges: [number, number, number, number][] }
const read = (file: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${file}`,
  import.meta.url), 'utf8'));
const cases = read('ovg-candidate-cases.json') as Case[];
const expected = read('ovg-real-sweep-expected.json') as Output[];

const normalize = (vertices: OVGSweepVertex[]) => vertices.map((vertex) => ({
  x: vertex.x, y: vertex.y,
  owners: vertex.owners?.map((owner) => ({ node: owner.node,
    directions: [...owner.directions].sort() })).sort((a, b) => a.node.localeCompare(b.node)) ?? [],
})).sort((a, b) => a.x - b.x || a.y - b.y);
const normalizeEdges = (edges: Array<{ from: { x: number; y: number };
  to: { x: number; y: number } }>) => edges.map(({ from, to }) => {
    const first = from.x < to.x || from.x === to.x && from.y < to.y ? from : to;
    const second = first === from ? to : from;
    return [first.x, first.y, second.x, second.y] as [number, number, number, number];
  }).sort((a, b) => {
    for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return 0;
  });

describe('pinned upstream flat OVG vertex build before tunnels', () => {
  for (const input of cases) {
    it(input.name, () => {
      const actual = buildFlatOVGVertices(input.nodes,
        [{ from: input.nodes[0]!.id, to: input.nodes[1]!.id }]);
      const oracle = expected.find((item) => item.name === input.name)!;
      expect(normalize(actual)).toEqual(normalize(oracle.vertices.slice(0, oracle.preTunnelCount)));
    });
    const oracle = expected.find((item) => item.name === input.name)!;
    it(`connected graph: ${input.name}`, () => {
      const graph = buildFlatOVG(input.nodes,
        [{ from: input.nodes[0]!.id, to: input.nodes[1]!.id }]);
      expect(normalize(graph.vertices)).toEqual(normalize(oracle.vertices));
      expect(graph.vertices.filter((vertex) => vertex.tunnel).map((vertex) =>
        `${vertex.x},${vertex.y}`).sort()).toEqual(oracle.vertices.filter((vertex) =>
        vertex.tunnel).map((vertex) => `${vertex.x},${vertex.y}`).sort());
      expect(normalizeEdges(graph.tunnelEdges)).toEqual(oracle.tunnelEdges);
      expect(normalizeEdges(graph.sweepEdges)).toEqual(oracle.edges);
    });
  }
});
