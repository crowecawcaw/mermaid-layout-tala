import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutopacity.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it.each(fixtures)('matches Go opacity validation and visibility for $input', ({ input, valid, zero }) => {
  const nodes = [
    { id: 'a', width: 40, height: 30, style: { opacity: input } },
    { id: 'b', width: 40, height: 30 },
  ];
  const edges = [{ id: 'e', from: 'a', to: 'b', style: { opacity: input } }];
  if (!valid) {
    expect(() => translateFlowchart(nodes, [], {})).toThrow(/opacity/);
    expect(() => translateFlowchart(nodes.slice(1).concat({ id: 'a', width: 40, height: 30 }), edges, {})).toThrow(/opacity/);
  } else {
    const { graph } = translateFlowchart(nodes, edges, {});
    expect(graph.Nodes[0]!.IsInvisible).toBe(zero);
    expect(graph.Edges[0]!.IsInvisible).toBe(zero);
  }
});
