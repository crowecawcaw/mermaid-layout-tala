import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutnodegeometry.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it.each(fixtures)('matches Go fresh-layout node geometry validation $name', ({ node, valid }) => {
  if (!valid) {
    expect(() => translateFlowchart([node], [], {})).toThrow(/position/);
    return;
  }
  const { graph } = translateFlowchart([node], [], {});
  expect(graph.Nodes[0]!.TopLeft).toBeNull();
});

it('requires both coordinates when an existing center is supplied', () => {
  expect(() => translateFlowchart([{ id: 'a', width: 40, height: 30, x: 1 }], [], {})).toThrow(/position/);
  expect(() => translateFlowchart([{ id: 'a', width: 40, height: 30, y: 1 }], [], {})).toThrow(/position/);
});
