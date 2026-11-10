import { expect, it } from 'vitest';
import fixture from './fixtures/upstream-layoutcancellation.json';
import { layoutFlowchart, routeEdges, withCancel, type TalaContext } from '../src/core.js';
import { coordinateLocalSeeds } from '../src/upstream/adapter/seed-coordination.js';
import { Score } from '../src/upstream/quality/scoring.js';

it('matches Go when layout, routing, or seed coordination starts canceled', () => {
  const [context, cancel] = withCancel();
  cancel();
  expect(() => layoutFlowchart([], [], { context })).toThrow(fixture.layout);
  expect(() => routeEdges([], [], [], { context })).toThrow(fixture.route);
  expect(() => coordinateLocalSeeds([1n, 2n], () => ({ value: 1, score: new Score(0, 0) }), context)).toThrow(fixture.seeds);
  expect(() => routeEdges([], [], ['missing'], { context })).toThrow(/not in the graph/);
  expect(() => layoutFlowchart([], [], { context: null as never })).toThrow(fixture.nilLayout);
  expect(() => routeEdges([], [], [], { context: null as never })).toThrow(fixture.nilRoute);
});

it('propagates cancellation during layout without changing caller inputs', () => {
  let checks = 0;
  const context: TalaContext = { Done: () => null, Err: () => ++checks > 100 ? new Error('context canceled') : null };
  const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, width: 40, height: 30 }));
  const edges = nodes.slice(1).map((node, i) => ({ id: `e${i}`, from: nodes[i]!.id, to: node.id }));
  const before = structuredClone({ nodes, edges });
  expect(() => layoutFlowchart(nodes, edges, { context })).toThrow(/context canceled/);
  expect(checks).toBeGreaterThan(100);
  expect({ nodes, edges }).toEqual(before);
});

it('propagates cancellation during rerouting without changing caller inputs', () => {
  let checks = 0;
  const context: TalaContext = { Done: () => null, Err: () => ++checks > 35 ? new Error('context canceled') : null };
  const nodes = [{ id: 'a', x: 20, y: 15, width: 40, height: 30 }, { id: 'b', x: 140, y: 15, width: 40, height: 30 }];
  const edges = [{ id: 'e', from: 'a', to: 'b', points: [] }];
  const before = structuredClone({ nodes, edges });
  expect(() => routeEdges(nodes, edges, ['e'], { context })).toThrow(/context canceled/);
  expect(checks).toBeGreaterThan(35);
  expect({ nodes, edges }).toEqual(before);
});
