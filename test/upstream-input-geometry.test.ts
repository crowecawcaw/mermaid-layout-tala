import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutinputgeometry.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it.each(fixtures)('matches Go fresh-layout geometry validation $name', ({ edge, valid }) => {
  const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
  if (!valid) {
    expect(() => translateFlowchart(nodes, [edge], {})).toThrow();
    return;
  }
  const { graph } = translateFlowchart(nodes, [edge], {});
  expect(graph.Edges[0]!.Points).toEqual([]);
});
