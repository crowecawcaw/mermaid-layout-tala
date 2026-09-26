import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaCluster, type ClusterArrangement } from '../src/tala/cluster-geometry.js';
import { TalaNode } from '../src/tala/graph.js';

interface NodeBox { id: string; width: number; height: number; x?: number; y?: number }
interface Case {
  name: string;
  arrangement: ClusterArrangement;
  fixedSize: boolean;
  padding: number;
  x: number;
  y: number;
  nodes: NodeBox[];
}
interface Output { name: string; vessel: Required<NodeBox>; nodes: Required<NodeBox>[];
  afterSync: Required<NodeBox>[] }
const read = (name: string) => JSON.parse(readFileSync(new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('cluster-geometry-cases.json') as Case[];
const expected = read('cluster-geometry-expected.json') as Output[];

describe('upstream cluster vessel geometry', () => {
  for (const [index, input] of cases.entries()) {
    it(`matches ${input.name}`, () => {
      const members = input.nodes.map((node) => new TalaNode(node));
      const vessel = new TalaNode({ id: 'vessel', width: 1, height: 1 });
      const cluster = new TalaCluster(vessel, members, input.arrangement,
        input.padding, input.fixedSize);
      vessel.topLeft = { x: input.x, y: input.y };
      cluster.arrangeNodes();
      const snapshot = () => ({ name: input.name,
        vessel: { id: vessel.id, width: vessel.width, height: vessel.height,
          x: vessel.topLeft!.x, y: vessel.topLeft!.y },
        nodes: members.map((node) => ({ id: node.id, width: node.width, height: node.height,
          x: node.topLeft!.x, y: node.topLeft!.y })) });
      const { afterSync, ...first } = expected[index]!;
      expect(snapshot()).toEqual(first);
      cluster.syncGeometry();
      expect(snapshot().nodes).toEqual(afterSync);
    });
  }
});
