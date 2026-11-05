import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgbuild.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import { buildOVGFromGraphWithGuard } from '../src/upstream/routing/ovg-build.js';
it.each(fixtures)('matches Go complete visibility build $trial $limit', (f) => {
  const trial = f.trial,
    g = new Graph(),
    node = g.AddNode(
      new Node(1n, 80 + (trial % 3) * 10, 60 + (trial % 5) * 10),
    );
  node.SetShape(f.shape);
  node.TopLeft = new Point((trial % 7) * 10, (trial % 9) * 10);
  node.IsInvisible = trial % 7 === 0;
  const guard = new OVGBuildGuard(Background, {
    ...defaultOVGBuildLimits(),
    work: BigInt(f.limit),
  });
  let nodes:
      | {
          point: { x: number; y: number };
          port: boolean;
          direction: number;
          center: boolean;
          near: boolean;
        }[]
      | null = null,
    edges: number[][] | null = null,
    error = '';
  try {
    const ovg = buildOVGFromGraphWithGuard(g, [], guard);
    nodes = ovg.Nodes.map((n) => ({
      point: { x: n.X, y: n.Y },
      port: n.isPortOf(node),
      direction: n.portDirectionsForObstacle(node),
      center: n.IsNodeCenter,
      near: n.IsNearPort?.has(node) ?? false,
    }));
    edges = ovg.Edges.map((e) => [e.From.Index, e.To.Index]);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.work).toBe(BigInt(f.work));
  expect(guard.nodes).toBe(BigInt(f.count));
  expect(guard.edges).toBe(BigInt(f.edgeCount));
  expect(guard.candidates).toBe(BigInt(f.candidates));
  expect(nodes).toEqual(f.nodes);
  expect(edges).toEqual(f.edges);
});
