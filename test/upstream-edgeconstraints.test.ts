import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutedgeconstraints.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it.each(fixtures)('matches Go edge constraints $name', ({ edge, error, minimum }) => {
  const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
  let message = '', actual: number[] = [];
  try {
    const { graph } = translateFlowchart(nodes, [edge], {});
    actual = [graph.Edges[0]!.MinWidth, graph.Edges[0]!.MinHeight];
  } catch (e) { message = (e as Error).message; }
  expect(message).toBe(error);
  expect(actual).toEqual(minimum);
});
