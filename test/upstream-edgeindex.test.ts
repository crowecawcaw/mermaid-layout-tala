import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutedgeindex.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it('matches Go edge identities across the signed 64-bit index range', () => {
  const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
  const edges = fixtures.map((fixture, i) => ({ id: `e${i}`, from: 'a', to: 'b', d2Index: BigInt(fixture.index) }));
  const { graph } = translateFlowchart(nodes, edges, {});
  expect(graph.Edges.map((edge) => ({ identity: edge.D2ID, entityId: edge.ID.toString() })))
    .toEqual(fixtures.map(({ identity, entityId }) => ({ identity, entityId })));
});
